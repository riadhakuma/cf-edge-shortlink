import {Hono} from "hono";
import {customAlphabet} from "nanoid";
type Bindings = {
    SHORT_URLS : KVNamespace;
};

const app = new Hono<{ Bindings : Bindings}>();
const nanoid = customAlphabet("1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",7);

app.get("/",(c) => {
    return c.json({
        status : "ok",
        service : "cf-edge-shortlink",
        endpoints : {
            create : "POST /shorten (playload: { url: string })",
            redirect : "GET /:code",
            stats : "GET /stats/:code",
        },
    });
});

app.post("/shorten", async (c) => {
    const body = await c.req.json<{ url?: string}>().catch(() => null);
    if (!body || !body.url) {
        return c.json({error: "L'attribut 'url' est requis."}, 400);
    }

    try {
        const parsed = new URL (body.url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
            throw new Error();
        }
    }catch {
        return c.json({ error:"l'URL fournie est invalide (doit commencer par http:// ou bien https//)."},400);
    }
    const code = nanoid();
    const createAt = new Date().toISOString();

    await c.env.SHORT_URLS.put(
        code,
        JSON.stringify({
            targetUrl: body.url,
            clicks:0,
            createAt,
        })
    );

    const shortUrl = `${new URL(c.req.url).origin}/${code}`;
    return c.json({ code, shortUrl, targetUrl : body.url},201);
});
app.get ("/:code", async (c) => {
    const code = c.req.param("code");
    const rawData = await c.env.SHORT_URLS.get(code);
    if(!rawData) {
        return c.text("URL courte introuvable ou expirée (404').",404);
        }
    const record = JSON.parse(rawData);
    record.clicks = (record.clicks || 0) + 1;
    c.executionCtx.waitUntil(c.env.SHORT_URLS.put(code, JSON.stringify(record)));
    return c.redirect(record.targetUrl, 302);
});
 app.get("/stats/:code", async (c) =>{
    const code = c.req.param("code");
    const rawData = await c.env.SHORT_URLS.get(code);
    if(!rawData){
        return c.json({ error:"Code introuvable"},404);
    }
    return c.json({ code,...JSON.parse(rawData) });
 });
 export default app;