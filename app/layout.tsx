import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "betta",
  description: "betta",
};

// Root layout: document, global styles, and the saved theme/language applied
// before first paint.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);var l=localStorage.getItem("lang");if(l==="ko")document.documentElement.setAttribute("data-lang","ko")}catch(e){}',
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
