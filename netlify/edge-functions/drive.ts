import { Context } from "https://edge.netlify.com";

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  
  // List files
  if (url.pathname === "/api/drive/list") {
    const folderId = "11pBU70shMYmBAw0lGEqd1h1nYK1hJiaG";
    const folderUrl = `https://drive.google.com/drive/folders/${folderId}?usp=sharing`;

    try {
      const response = await fetch(folderUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        },
      });
      const html = await response.text();
      const files: { id: string; name: string }[] = [];

      const idPattern = /[a-zA-Z0-9_-]{28,45}/g;
      const jsonPattern = /[^"\\\[\]\n\r\t]+?\.json/gi;

      const idIndices: {id: string, index: number}[] = [];
      const foundNames: {name: string, index: number}[] = [];

      let idMatch;
      while ((idMatch = idPattern.exec(html)) !== null) {
        idIndices.push({ id: idMatch[0], index: idMatch.index });
      }

      let nameMatch;
      while ((nameMatch = jsonPattern.exec(html)) !== null) {
        let name = nameMatch[0]
          .replace(/\\u([0-9a-fA-F]{4})/g, (_, grp) => String.fromCharCode(parseInt(grp, 16)))
          .replace(/&quot;/g, '')
          .replace(/\\/g, '')
          .replace(/^x22/, '')
          .replace(/^"/, '')
          .trim();

        if (name.length > 5 && !name.includes('/') && !name.includes('manifest.json')) {
          foundNames.push({ name, index: nameMatch.index });
        }
      }

      for (const nameObj of foundNames) {
        const candidateIds = idIndices.filter(idObj => idObj.index < nameObj.index && (nameObj.index - idObj.index) < 1500);
        if (candidateIds.length > 0) {
          const closestId = candidateIds[candidateIds.length - 1].id;
          if (!files.find(f => f.id === closestId || f.name === nameObj.name)) {
            files.push({ id: closestId, name: nameObj.name });
          }
        }
      }

      return new Response(JSON.stringify({ files }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Failed to list files" }), { status: 500 });
    }
  }

  // Download file
  if (url.pathname.startsWith("/api/drive/download/")) {
    const fileId = url.pathname.split("/").pop();
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error("Download failed");
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Failed to download file" }), { status: 500 });
    }
  }

  return new Response("Not Found", { status: 404 });
};
