import { App } from './app/App';
import './style.css';

const root = document.querySelector<HTMLElement>('#app');
if (root === null) throw new Error('SwarmGPU application root was not found');

const app = new App(root);
void app.initialize();

if (import.meta.env.DEV) {
  Object.defineProperty(globalThis, '__SWARM_GPU_APP__', {
    configurable: true,
    value: app,
  });
}

if (import.meta.hot !== undefined) {
  import.meta.hot.dispose(() => {
    app.dispose();
  });
}
