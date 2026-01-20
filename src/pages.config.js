import AnalyticsDashboard from './pages/AnalyticsDashboard';
import ContentCalendar from './pages/ContentCalendar';
import CreatePost from './pages/CreatePost';
import CreateProject from './pages/CreateProject';
import Dashboard from './pages/Dashboard';
import Integrations from './pages/Integrations';
import ProjectDetails from './pages/ProjectDetails';
import TikTokAnalytics from './pages/TikTokAnalytics';
import AdminPanel from './pages/AdminPanel';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AnalyticsDashboard": AnalyticsDashboard,
    "ContentCalendar": ContentCalendar,
    "CreatePost": CreatePost,
    "CreateProject": CreateProject,
    "Dashboard": Dashboard,
    "Integrations": Integrations,
    "ProjectDetails": ProjectDetails,
    "TikTokAnalytics": TikTokAnalytics,
    "AdminPanel": AdminPanel,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};