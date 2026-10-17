import AcceptInvitationForm from "../ui/AcceptInvitationForm";
type SearchParams = { token?: string | string[]; passwordRequired?: string | string[] };
export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] : params.token ?? "";
  const passwordRequiredParam = Array.isArray(params.passwordRequired) ? params.passwordRequired[0] : params.passwordRequired;
  return <main className="tracking-page"><section className="tracking-card"><p className="eyebrow">TEAM INVITATION</p><h1>Set up your account</h1><p>Choose a password to accept your workspace invitation.</p><AcceptInvitationForm token={token} passwordRequired={passwordRequiredParam !== "false"} /></section></main>;
}
