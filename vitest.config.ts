import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'l1',
          environment: 'node',
          include: ['test/l1/**/*.test.ts'],
          typecheck: {
            enabled: true,
            include: ['test/l1/**/*.test-d.ts'],
            tsconfig: './tsconfig.json',
          },
        },
      },
    ],
  },
});
