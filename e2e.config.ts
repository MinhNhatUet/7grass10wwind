import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { copilot } from 'e2e/oauth/copilot';

export default {
  // Your GitHub Copilot subscription serves the model; sign in once with `e2e login github-copilot`, `e2e models github-copilot` lists the ids.
  agents: {
    default: {
      model: copilot('gpt-4.1'),
      system: 'You are a thorough QA agent. Verify every outcome.',
    },
  },
  targets: [{
    engine: web(),
    app: {
      url: process.env.APP_URL ?? 'http://localhost:3000',
      // Or let the runner start the dev server:
      // command: { executable: 'npm', args: ['run', 'dev'] },
    },
  }],
} satisfies E2EConfig;
