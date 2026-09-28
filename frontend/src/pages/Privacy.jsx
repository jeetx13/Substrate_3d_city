import { LegalShell } from "@/components/LegalShell";

export default function Privacy() {
  return (
    <LegalShell title="Privacy policy" testId="privacy-page">
      <p>SUBSTRATE renders public GitHub repositories as 3D cities. This page describes what the service processes and keeps.</p>
      <h2>What is processed</h2>
      <p>When you submit a repository URL, the server performs a shallow clone of that public repository, reads its Python, JavaScript and TypeScript source files to extract import statements, and reads the git log to compute change frequency and history snapshots. The clone is used only to compute this graph and to serve read-only file previews while you explore.</p>
      <h2>What is stored</h2>
      <ul>
        <li>The computed graph: file paths, line counts, languages, churn scores, layout positions, top author names as they appear in the git log, and bucketed history snapshots.</li>
        <li>The repository URL and the pipeline stage log for that analysis.</li>
      </ul>
      <p>Author names come from the public commit history of the repository you chose. No account, email address or personal profile is created for visitors. Cloned working copies live in temporary storage and are discarded when the server restarts.</p>
      <h2>What is not collected</h2>
      <p>The site does not use advertising trackers and does not sell data. Standard server logs may record request metadata such as IP address and timestamps for operational purposes.</p>
      <h2>Contact</h2>
      <p>If a repository you maintain has been analyzed and you would like its stored graph removed, contact the operator of this deployment.</p>
    </LegalShell>
  );
}
