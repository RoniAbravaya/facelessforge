import AdminPanel from './pages/AdminPanel';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import ContentCalendar from './pages/ContentCalendar';
import CreatePost from './pages/CreatePost';
import CreateProject from './pages/CreateProject';
import Dashboard from './pages/Dashboard';
import Integrations from './pages/Integrations';
import ProjectDetails from './pages/ProjectDetails';
import TikTokAnalytics from './pages/TikTokAnalytics';
import Billing from './pages/Billing';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminPanel": AdminPanel,
    "AnalyticsDashboard": AnalyticsDashboard,
    "ContentCalendar": ContentCalendar,
    "CreatePost": CreatePost,
    "CreateProject": CreateProject,
    "Dashboard": Dashboard,
    "Integrations": Integrations,
    "ProjectDetails": ProjectDetails,
    "TikTokAnalytics": TikTokAnalytics,
    "Billing": Billing,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};