import type { ReactElement } from "react";
import { StatusBadge } from "@civil-terrain/ui";

export function App(): ReactElement {
  return (
    <main>
      <h1>Civil Terrain &amp; Slope Risk Viewer</h1>
      <p>公開地形データから工事候補地の標高・傾斜・地形分類を可視化します。</p>
      <StatusBadge status="REFERENCE" />
    </main>
  );
}
