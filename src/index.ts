import { jwtVerify, createRemoteJWKSet, importPKCS8, SignJWT } from "jose";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";

export interface AccessIdentity {
	[key: string]: unknown;
	email: string;
	sub: string;
}


export class MyMCP extends McpAgent<Env, Record<string, never>, AccessIdentity> {
	server = new McpServer({
		name: "Access Self-Hosted MCP Demo",
		version: "1.0.0",
	});

	async init() {
const MANIM_TEMPLATE_PROMPT = `Write clean, error-free Manim code using \`manim-voiceover\` with the Kokoro TTS engine. 
When converting mathematical notation for TTS, spell variables and expressions as they are naturally spoken in the target language. 
For example, in Spanish: "y" as "ye", "x" as "equis", and "f(x)" as "efe de equis". 
Add suitable punctuation, pauses, and verbal forms to ensure clear and natural speech.

## 2. THE MASTER TEMPLATE (RETURN ONLY THE CODE)
\`\`\`python
from manim import *
from manim_voiceover import VoiceoverScene
from kokoro_mv import KokoroService
import numpy as np

# --- 1. CONFIGURATION ---
config.pixel_width  = 1080
config.pixel_height = 1920
config.frame_width  = 9.0
config.frame_height = 16.0
config.frame_rate   = 60

# --- 2. BRAND PALETTE ---
BG  = "#1E1E1E"
...

# --- 3. FONTS ---
FONT_TITLE = "EB Garamond. Use Unicode double-struck characters only for the first letter of each word in titles (e.g., 𝕋itle 𝕊tructure), while keeping the remaining letters in the normal font."
FONT_BODY   = "Lato"
FONT_ACCENT = "Lobster Two"
FONT_MONO   = "Latin Modern Mono"

# --- 4. SCRIPT---
LANG = "es"
SCRIPT = {
    "es": {
        "beat0": "Hola, bienvenidos a NuciBotEdu.",
        "beat1": "Hoy aprenderemos algo nuevo.",
        "beat2": "Y así concluimos el tema.",
    }
}

# --- 5. MAIN SCENE ---
class MainVideo(VoiceoverScene):
    def construct(self):
        self.set_speech_service(
            KokoroService(
                model_path="/app/kokoro_models/kokoro-v1.0.onnx",
                voices_path="/app/kokoro_models/voices-v1.0.bin",
                voice="ef_dora",
                lang="es",
                speed=1.0
            )
        )
        self.camera.background_color = BG
        vo = SCRIPT[LANG]

        # BEAT 0
        with self.voiceover(text=vo["beat0"]) as tracker:
            pass # Animations here

        # BEAT 1
        with self.voiceover(text=vo["beat1"]) as tracker:
            pass # Animations here
        ...
\`\`\`

## 3. STRICT ANIMATION WORKFLOW (CRITICAL: ONE CLASS ONLY)
**BACKEND AUTO-RENDERER LIMITATION:** When coding, you MUST write exactly ONE single class (e.g., \`class MainVideo\`). The automated rendering backend will ONLY render the first class it finds and will ignore everything else.
* **NEVER** create multiple scenes (Do NOT create \`class Scene2\`, \`class Scene3\`, etc.).
* ALL beats and animations for the entire video MUST go sequentially inside the \`construct\` method of the single class.
* **The Rule of Continuity (Ariadne's Thread):** Since everything lives in one long scene, a new beat never starts from scratch. If beat 0 ends with a circle, beat 1 MUST transform (\`ReplacementTransform\`), move (\`.animate\`), or scale that circle to become the next element.
* **NEVER cut to black.** Always transition elements smoothly. Fade out elements strictly when they are no longer needed to free up screen space.
* **FOR TITLE USE \`.set_color_by_gradient()\` and FOR AREAS USE .set_fill(color=[gradient_colors], opacity=1.0)

## 4. STRICT CODE CONSTRAINTS (Never break these)
* **Default text:** Default text is white, which is invisible on \`WHITE_BG\`. ALWAYS set text color to \`DARK_TEXT\` or a brand color.
* **MathTex:** NEVER use the \`weight\` parameter (it causes an error). ALWAYS use raw strings (\`r"..."\`) for special characters. MathTex does NOT use standard fonts.
* **Emojis:** NEVER use unicode emojis. Manim cannot render them. Use Manim shapes or text.
* **Rectangles:** The standard \`Rectangle\` has no \`corner_radius\` attribute. If you need rounded corners, use \`RoundedRectangle(corner_radius=...)\`.

## 5. SPATIAL & COMPOSITION RULES (9x16 Vertical Format)
The frame is **9 units wide × 16 units tall**, center is \`(0, 0)\`. Fit all content within a **14u height limit** (leave 1u margin top/bottom).
Before placing any object, you MUST follow these logical steps:
1. **Vertical Slotting:** Assign objects to fixed slots: Title (\`UP * 5.5\`), Main (\`UP * 1.5\`), Step label (\`UP * 0.3\`), Secondary (\`DOWN * 1.5\`), Brand/Outro (\`DOWN * 5.0\`). Do not overlap slots.
2. **Dependent Elements:** If an object relates to another, ALWAYS use \`next_to(obj, DIRECTION)\` (e.g., \`label.next_to(box, DOWN)\`). NEVER use \`move_to\` for dependent elements.
3. **Bounding Box Limits:** Calculate max widths. If \`total_width > 8.5u\`, reduce spacing or split the group into rows. Never compress visually.
4. **Collision Check:** Ensure objects do not overlap *at the frame they appear*. Reserve spatial bounding boxes for objects that will move later.
5. **Z-Index:** For overlapping background elements (like highlights), use \`self.add(bg)\` first or assign a lower \`z_index\` so they don't cover text.`;

		// 🎬 Herramienta de generación de video
		this.server.tool(
		"generate_video",
		"Envía el código Manim y la resolución deseada al servicio de renderizado y devuelve la URL del video generado.",
		{
			code: z.string().describe(MANIM_TEMPLATE_PROMPT),
			resolution: z
			.string()
			.default("720, 1280")
			.describe("Resolución en formato ANCHOxALTO, p.ej. '720, 1280'."),
		},
		async ({ code, resolution }) => {
			const endpoint = this.env.VIDEO_GEN_ENDPOINT;
			if (!endpoint) {
			return {
				content: [
				{
					type: "text",
					text: "Error: No se configuró VIDEO_GEN_ENDPOINT.",
				},
				],
				isError: true,
			};
			}

			try {
			// 1. Obtener token de identidad con la cuenta de servicio
			const idToken = await this.getGoogleIdToken();

			// 2. Enviar solicitud al Cloud Run
			const response = await fetch(endpoint, {
				method: "POST",
				headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${idToken}`,
				},
				body: JSON.stringify({ code, resolution }),
			});

			if (!response.ok) {
				const errorText = await response.text();
				return {
				content: [
					{
					type: "text",
					text: `Error del servicio (${response.status}): ${errorText}`,
					},
				],
				isError: true,
				};
			}

			const data = await response.json();

			if (data.status === "success" && data.video_url) {
				return {
				content: [
					{
					type: "text",
					text: `Video generado correctamente: ${data.video_url}`,
					},
				],
				};
			}

			// Error controlado desde el servicio
			return {
				content: [
				{
					type: "text",
					text: `El servicio respondió con error: ${data.message ?? "desconocido"}`,
				},
				],
				isError: true,
			};
			} catch (error) {
			return {
				content: [
				{
					type: "text",
					text: `Error de conexión: ${
					error instanceof Error ? error.message : String(error)
					}`,
				},
				],
				isError: true,
			};
			}
		}
		);
	}

	/**
	 * Genera un Google ID Token usando la clave JSON de la cuenta de servicio.
	 * Espera las variables de entorno SA_CLIENT_EMAIL y SA_PRIVATE_KEY.
	 */
	private async getGoogleIdToken(): Promise<string> {
	const privateKey = this.env.SA_PRIVATE_KEY;
	const clientEmail = this.env.SA_CLIENT_EMAIL;
	const audience = this.env.VIDEO_GEN_ENDPOINT;

	if (!privateKey || !clientEmail || !audience) {
		throw new Error(
		"Faltan variables de entorno: SA_PRIVATE_KEY, SA_CLIENT_EMAIL o VIDEO_GEN_ENDPOINT"
		);
	}

	const key = await importPKCS8(privateKey, "RS256");

	// ✅ Pasamos target_audience dentro del objeto del constructor
	const jwt = await new SignJWT({ target_audience: audience })
		.setProtectedHeader({ alg: "RS256", typ: "JWT" })
		.setIssuer(clientEmail)
		.setSubject(clientEmail)
		.setAudience("https://oauth2.googleapis.com/token")
		.setIssuedAt()
		.setExpirationTime("1h")
		.sign(key);

	const res = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
		grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
		assertion: jwt,
		}),
	});

	const data = await res.json();
	if (!data.id_token) {
		throw new Error(
		`No se pudo obtener el id_token: ${JSON.stringify(data)}`
		);
	}

	return data.id_token;
	}

}
/**
 * Verify the Access JWT using your team's public keys.
 * See: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
 */
async function verifyAccessJwt(token: string, env: Env): Promise<AccessIdentity> {
	const JWKS = createRemoteJWKSet(new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`));

	const { payload } = await jwtVerify(token, JWKS, {
		issuer: env.TEAM_DOMAIN,
		audience: env.POLICY_AUD,
	});

	return {
		email: (payload.email as string) ?? "unknown",
		sub: payload.sub ?? "unknown",
	};
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const token = request.headers.get("Cf-Access-Jwt-Assertion");
		if (!token) {
			return new Response("Unauthorized: missing Cf-Access-Jwt-Assertion", {
				status: 401,
			});
		}

		try {
			await verifyAccessJwt(token, env);
		} catch {
			return new Response("Invalid token", { status: 403 });
		}

		return MyMCP.serve("/mcp").fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;