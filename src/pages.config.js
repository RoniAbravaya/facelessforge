import Dashboard from './pages/Dashboard';
import Integrations from './pages/Integrations';
import CreateProject from './pages/CreateProject';


export const PAGES = {
    "Dashboard": Dashboard,
    "Integrations": Integrations,
    "CreateProject": CreateProject,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
};