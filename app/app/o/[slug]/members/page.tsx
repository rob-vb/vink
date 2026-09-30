import type { Metadata } from "next";
import { requireAdmin } from "../organisation";
import { MembersList } from "./members-list";

export const metadata: Metadata = { title: "Members · Vink" };

export default async function MembersPage({ params }: PageProps<"/app/o/[slug]/members">) {
  const { slug } = await params;
  await requireAdmin(slug);
  return <MembersList organisationSlug={slug} />;
}
