import { Routes } from '@angular/router';
import { Dashboard } from './features/url-shortner/pages/dashboard/dashboard';
import { UrlService } from './core/services/url';

export const routes: Routes = [
  {
    path: 'url-shortner/dashboard',
    component: Dashboard,
    providers: [UrlService]
  },
  {
    path: 'url-shortner',
    pathMatch: 'full',
    redirectTo: 'url-shortner/dashboard',
  }
];
