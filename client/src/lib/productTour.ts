import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import type { Role } from '../types.js';

export function startProductTour(role: Role) {
  const canManage = role === 'Admin' || role === 'Designer';
  const isAdmin = role === 'Admin';

  driver({
    showProgress: true,
    smoothScroll: true,
    popoverClass: 'nx-tour-popover',
    steps: [
      {
        element: '[data-tour="sidebar-dashboard"]',
        popover: {
          title: 'Dashboard',
          description: 'Your home base — template stats and a shortcut back into recent work.',
        },
      },
      {
        element: '[data-tour="sidebar-templates"]',
        popover: {
          title: 'Templates',
          description: 'Every template your team has created. Fill or edit them from here.',
        },
      },
      ...(canManage
        ? [
            {
              element: '[data-tour="sidebar-new-template"]',
              popover: {
                title: 'New Template',
                description: 'Start from a blank canvas, or describe what you need and let AI build it with you.',
              },
            },
          ]
        : []),
      ...(canManage
        ? [
            {
              element: '[data-tour="sidebar-gallery"]',
              popover: {
                title: 'Template Gallery',
                description: 'Pick a premade starting point for your industry — HR, construction, real estate, and more.',
              },
            },
          ]
        : []),
      ...(canManage
        ? [
            {
              element: '[data-tour="sidebar-assets"]',
              popover: {
                title: 'Assets',
                description: 'Upload logos, stamps, and images to reuse across your templates.',
              },
            },
          ]
        : []),
      ...(canManage
        ? [
            {
              element: '[data-tour="sidebar-letterheads"]',
              popover: {
                title: 'Letterheads',
                description: 'Build a reusable header and footer once, then apply it to any template.',
              },
            },
          ]
        : []),
      ...(isAdmin
        ? [
            {
              element: '[data-tour="sidebar-settings"]',
              popover: {
                title: 'Settings',
                description: 'Manage your workspace settings from here.',
              },
            },
          ]
        : []),
      {
        element: '[data-tour="sidebar-role-switcher"]',
        popover: {
          title: 'Switch roles',
          description: 'Preview the app as an Admin, Designer, or Form Filler — each sees a different set of tools.',
        },
      },
      {
        element: '[data-tour="dashboard-stats"]',
        popover: {
          title: 'At a glance',
          description: 'Total templates, recent activity, and when things were last updated.',
        },
      },
      {
        element: '[data-tour="dashboard-recent"]',
        popover: {
          title: 'Recent Templates',
          description: 'Jump straight back into whatever you were working on.',
        },
      },
      {
        popover: {
          title: "You're all set!",
          description: 'Explore at your own pace — click "Take a tour" anytime from the top bar for a refresher.',
        },
      },
    ],
  }).drive();
}
