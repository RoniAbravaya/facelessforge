import CreateProject from './pages/CreateProject';
import Dashboard from './pages/Dashboard';
import Integrations from './pages/Integrations';
import ProjectDetails from './pages/ProjectDetails';
import TikTokAnalytics from './pages/TikTokAnalytics';
import __Layout from './Layout.jsx';


export const PAGES = {
    "CreateProject": CreateProject,
    "Dashboard": Dashboard,
    "Integrations": Integrations,
    "ProjectDetails": ProjectDetails,
    "TikTokAnalytics": TikTokAnalytics,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};