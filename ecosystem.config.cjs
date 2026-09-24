// pm2 app for https://docuhelper.robvb.com. scripts/deploy.sh reloads it.
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
  ],
};
