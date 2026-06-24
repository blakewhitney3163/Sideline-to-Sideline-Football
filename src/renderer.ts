import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './ErrorBoundary';

declare const window: any;

window.onerror = (msg: any, src: any, line: any, col: any, err: any) => {
  console.error('Renderer error:', msg, src, line, col, err);
};
window.onunhandledrejection = (e: any) => {
  console.error('Unhandled promise rejection:', e.reason);
};

const container = document.getElementById('root') ?? document.createElement('div');
if (!container.parentNode) document.body.appendChild(container);

const root = createRoot(container);
root.render(
  React.createElement(ErrorBoundary, null,
    React.createElement(App, null)
  )
);

// Hide splash directly — avoids any CSP / inline-script dependency
setTimeout(() => {
  const splash = document.getElementById('splash');
  if (splash) {
    splash.classList.add('fade-out');
    setTimeout(() => splash.remove(), 520);
  }
}, 60);
