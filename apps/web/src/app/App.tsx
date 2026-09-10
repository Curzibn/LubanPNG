import { BrowserRouter, Route, Routes } from "react-router"
import { SiteLayout } from "../components/SiteLayout.tsx"
import { DashboardPage } from "../pages/dashboard/DashboardPage.tsx"
import { DevelopersPage } from "../pages/developers/DevelopersPage.tsx"
import { HomePage } from "../pages/home/HomePage.tsx"
import { PrivacyPage } from "../pages/legal/PrivacyPage.tsx"
import { TermsPage } from "../pages/legal/TermsPage.tsx"
import { LoginPage } from "../pages/login/LoginPage.tsx"
import { NotFoundPage } from "../pages/NotFoundPage.tsx"
import { PricingPage } from "../pages/pricing/PricingPage.tsx"
import { SessionProvider } from "../session/SessionProvider.tsx"
import { VisitTracker } from "./VisitTracker.tsx"

export const App = () => (
  <BrowserRouter>
    <SessionProvider>
      <VisitTracker />
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<HomePage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="developers" element={<DevelopersPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </SessionProvider>
  </BrowserRouter>
)
