import Dashboard from './pages/Dashboard';
import Integrations from './pages/Integrations';
import CreateProject from './pages/CreateProject';
import ProjectDetails from './pages/ProjectDetails';


export const PAGES = {
    "Dashboard": Dashboard,
    "Integrations": Integrations,
    "CreateProject": CreateProject,
    "ProjectDetails": ProjectDetails,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
};