import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Newly enabled performance guidance in Next 16.3; retain visible warnings for
  // existing hydration/fetch effects without widening this security change into a UI rewrite.
  {
    files: [
      "src/components/auth/{LoginForm,SignupForm}.tsx",
      "src/components/dashboard/{BillingReturn,CreditPurchaseReturn,GettingStartedHome,IcpPanel,RoadmapPanel,WeeklyCheckIn}.tsx",
      "src/components/dashboard/home/ThisWeekCalendar.tsx",
    ],
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
