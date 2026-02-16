import "./globals.css";
import { Montserrat } from "next/font/google";
import localFont from "next/font/local";

export const metadata = {
  title: "Finora - Personal Finance Tracker",
  description: "Clarity for your finances",
};


const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const glacial = localFont({
  src: [
    { path: "../public/fonts/GlacialIndifference-Regular.otf", weight: "400", style: "normal" },
    { path: "../public/fonts/GlacialIndifference-Bold.otf", weight: "700", style: "normal" },
  ],
  variable: "--font-heading",
  display: "swap",
});

const themeInitScript = `
(function () {
  try {
    var saved = localStorage.getItem("theme"); // "system" | "dark" | "light"
    var theme = saved || "system";
    var resolved = theme;

    if (theme === "system") {
      var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      resolved = prefersDark ? "dark" : "light";
    }

    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.setAttribute("data-theme-mode", theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${montserrat.variable} ${glacial.variable}`}>
      <head>
        {/* Set theme BEFORE React hydrates to prevent mismatch */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}