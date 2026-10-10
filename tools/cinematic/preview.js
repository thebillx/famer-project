import { journeyMarkup } from '../../apps/web/components/cinematic/markup.ts';
import '../../apps/web/components/cinematic/cinematic.css';
import { mountJourney } from '../../apps/web/public/cinematic/main.js';
const root = document.querySelector('#preview');
root.innerHTML = journeyMarkup;
const dispose = mountJourney(root);
if (import.meta.hot) import.meta.hot.dispose(dispose);
