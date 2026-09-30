import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";
import { email } from "./intake";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

// Email-in: the Cloudflare Worker hands over each email sent to an Intake Address.
http.route({ path: "/intake/email", method: "POST", handler: email });

export default http;
