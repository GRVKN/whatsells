import { login } from "../shopify.server";

export async function loader({ request }) {
  return login(request);
}

export async function action({ request }) {
  return login(request);
}

// Für /auth/session-token, /auth/callback usw. braucht es keine UI.
// Die Response kommt von shopify.login().
export default function AuthCatchAll() {
  return null;
}