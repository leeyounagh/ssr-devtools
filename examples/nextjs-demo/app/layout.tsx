import { SSRDevtoolsScript } from "@leeyounagh/ssr-devtools/react";
import type { ReactNode } from "react";

export const metadata = { title: "SSR DevTools demo" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          margin: 0,
          padding: "24px",
          maxWidth: 800,
        }}
      >
        <nav style={{ marginBottom: 24, display: "flex", gap: 12 }}>
          <a href="/">Home</a>
          <a href="/posts">Posts</a>
        </nav>
        {children}
        <SSRDevtoolsScript />
      </body>
    </html>
  );
}
