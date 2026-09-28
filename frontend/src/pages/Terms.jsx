import { LegalShell } from "@/components/LegalShell";

export default function Terms() {
  return (
    <LegalShell title="Terms and conditions" testId="terms-page">
      <p>By using SUBSTRATE you agree to the following terms.</p>
      <h2>Use of the service</h2>
      <p>SUBSTRATE is a visualization aid for public source code repositories. You may only submit repositories that are public and that you are permitted to access under GitHub's terms and the repository's license. Do not submit repositories with the intent of overloading the service.</p>
      <h2>Accuracy</h2>
      <p>The dependency graph, churn scores and history are computed heuristically from import statements and git metadata. Dynamic imports and pattern-matched edges are marked as low confidence. The city is not a static analysis tool and may omit or mis-resolve relationships. It is provided for exploration only, without warranty of any kind.</p>
      <h2>Limits</h2>
      <p>Repositories are capped at 1,500 source files and recent history is sampled into a limited number of snapshots. Very large repositories are partially rendered and the interface says so when this happens.</p>
      <h2>Intellectual property</h2>
      <p>Source code shown in previews remains the property of its respective owners and is displayed under the terms of the repository's own license. SUBSTRATE does not claim any rights over analyzed repositories.</p>
      <h2>Changes</h2>
      <p>These terms may be updated as the service evolves. Continued use after a change constitutes acceptance of the updated terms.</p>
    </LegalShell>
  );
}
