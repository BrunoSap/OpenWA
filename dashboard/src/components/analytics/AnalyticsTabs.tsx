/**
 * Phase 7 Plan 03 Task 3: Analytics tabs navigation component.
 *
 * Provides in-page tab navigation between 5 analytics views.
 */

import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './AnalyticsTabs.css';

const ANALYTICS_TABS = [
  { path: '/analytics', label: 'overview' },
  { path: '/analytics/performance', label: 'performance' },
  { path: '/analytics/cost', label: 'cost' },
  { path: '/analytics/conversations', label: 'conversations' },
  { path: '/analytics/alerts', label: 'alerts' },
];

export function AnalyticsTabs() {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <nav className="analytics-tabs" role="tablist" aria-label="Analytics sections">
      {ANALYTICS_TABS.map(tab => {
        const isActive = location.pathname === tab.path;
        return (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={({ isActive }) => `analytics-tab ${isActive ? 'active' : ''}`}
            role="tab"
            aria-selected={isActive}
          >
            {t(`analyticsNav.${tab.label}`)}
          </NavLink>
        );
      })}
    </nav>
  );
}
