Native runtime preparation no longer uses a shared temporary Electron ABI probe file, preventing concurrent `npm run` flows from failing with a missing-module error during startup or packaging.
