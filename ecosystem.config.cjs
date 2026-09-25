// pm2 apps for https://docuhelper.robvb.com. scripts/deploy.sh reloads them.
module.exports = {
  apps: [
    {
      name: "docuhelper",
      cwd: __dirname,
      script: "node_modules/.bin/next",
      args: "start -H 127.0.0.1 -p 3003",
      env: {
        // Convex over IPv6 from this VPS times out; prefer IPv4.
        NODE_OPTIONS: "--dns-result-order=ipv4first",
      },
    },
    {
      // Answers the Claude steps with Claude Code until Vertex is set up
      // (scripts/claude-bridge). nginx serves it at /claude-bridge/.
      name: "docuhelper-claude-bridge",
      cwd: __dirname,
      script: "scripts/claude-bridge/server.ts",
      interpreter: "node",
      node_args: "--env-file=.env --import tsx",
    },
  ],
};
