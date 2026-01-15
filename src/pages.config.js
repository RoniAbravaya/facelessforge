import Dashboard from './pages/Dashboard';
import Integrations from './pages/Integrations';
import CreateProject from './pages/CreateProject';
import ProjectDetails from './pages/ProjectDetails';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Integrations": Integrations,
    "CreateProject": CreateProject,
    "ProjectDetails": ProjectDetails,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};