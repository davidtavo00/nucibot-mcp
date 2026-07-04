import { jwtVerify, createRemoteJWKSet } from "jose";
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
		this.server.tool(
			"add",
			"Add two numbers the way only MCP can",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ text: String(a + b), type: "text" }],
			}),
		);

		this.server.tool(
		"math_post",
		"Genera una imagen a partir de un HTML matemático (usando MathJax) enviando el código al servicio de renderizado. El LLM debe construir el HTML con las variables correspondientes: tema, problema LaTeX, solución LaTeX, color del tema, etc. La respuesta contiene la URL de la imagen generada.",
		{
			html_content: z
			.string()
			.describe("El HTML completo que se va a renderizar. Debe incluir los estilos, el fondo, las fórmulas LaTeX y los marcadores de posición sustituidos por el contenido real."),
			width: z
			.number()
			.int()
			.min(1)
			.max(4096)
			.default(1080)
			.describe("Ancho de la imagen en píxeles."),
			height: z
			.number()
			.int()
			.min(1)
			.max(4096)
			.default(1350)
			.describe("Alto de la imagen en píxeles."),
		},
		async ({ html_content, width, height }) => {
			const endpoint = this.env.MATH_RENDER_ENDPOINT;
			if (!endpoint) {
			return {
				content: [{ type: "text", text: "Error: No se ha configurado la URL de renderizado (MATH_RENDER_ENDPOINT)." }],
				isError: true,
			};
			}

			const payload = {
			html: html_content,
			width,
			height,
			};

			const headers: HeadersInit = {
			"Content-Type": "application/json",
			};

			try {
			const response = await fetch(endpoint, {
				method: "POST",
				headers,
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const errorText = await response.text();
				return {
				content: [
					{
					type: "text",
					text: `Error del servicio de renderizado (${response.status}): ${errorText}`,
					},
				],
				isError: true,
				};
			}

			const data = await response.json();
			if (data.status !== "success" || !data.image_url) {
				return {
				content: [{ type: "text", text: "Respuesta inesperada del servicio de renderizado." }],
				isError: true,
				};
			}

			// Devolver el enlace como recurso o simplemente como texto
			// Opción 1: Como recurso (recomendado para imágenes)
			return {
				content: [
				{
					type: "resource",
					resource: {
					uri: data.image_url,
					mimeType: "image/png", // Ajusta el MIME según lo que devuelva el servicio
					text: `Imagen generada correctamente: ${data.message ?? ""}`,
					},
				},
				],
			};
			// Opción 2: Solo texto con la URL (si prefieres que el LLM la mencione)
			//return { content: [{ type: "text", text: `Imagen generada: ${data.image_url}` }] };
			} catch (error) {
			return {
				content: [{ type: "text", text: `Error de conexión: ${error instanceof Error ? error.message : String(error)}` }],
				isError: true,
			};
			}
		}
		);
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