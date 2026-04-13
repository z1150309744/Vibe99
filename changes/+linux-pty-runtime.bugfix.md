Linux development runs and packaged builds now restore the PTY native module correctly under Electron 36, fixing the startup crash that was falling back to a missing `build/Release/pty.node` binary.
