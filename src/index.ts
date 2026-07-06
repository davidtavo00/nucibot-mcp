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


		// 🎬 Herramienta de generación de video
		this.server.tool(
		"generate_video",
		"Envía el código Manim y la resolución deseada al servicio de renderizado y devuelve la URL del video generado.",
		{
			code: z.string().describe("Código Manim completo a renderizar."),
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
		const audience = this.env.VIDEO_GEN_ENDPOINT; // target_audience

		if (!privateKey || !clientEmail || !audience) {
		throw new Error(
			"Faltan variables de entorno: SA_PRIVATE_KEY, SA_CLIENT_EMAIL o VIDEO_GEN_ENDPOINT"
		);
		}

		const key = await importPKCS8(privateKey, "RS256");

		const jwt = await new SignJWT({})
		.setProtectedHeader({ alg: "RS256", typ: "JWT" })
		.setIssuer(clientEmail)
		.setSubject(clientEmail)
		.setAudience("https://oauth2.googleapis.com/token")
		.setIssuedAt()
		.setExpirationTime("1h")
		.setClaim("target_audience", audience)
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