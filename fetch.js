fetch("http://localhost:3000/api/health").then(r => r.json()).then(console.log).catch(console.error);
