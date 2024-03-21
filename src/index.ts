import { Auth } from "msmc";
import express from "express";
import fs from "fs/promises";
import axios, { AxiosError } from "axios";
import memorystore from "memorystore";
import session from "express-session";
import { decrypt } from "./encrypt/Encrypt.js";
import cookieParser from "cookie-parser";

declare module "express-session" {
  export interface SessionData {
    d: string;
    u: string;
    n: string;
    c: string;
  }
}

const Memorystore = memorystore(session);

const config: Record<string, any> = JSON.parse(
  await fs.readFile("config.json", "utf-8")
);

let auth: Auth;

const sessionSecret: string = await config.sessionSecret;

const maxAge = 10 * 60 * 1000;
const sessionObj = {
  secret: sessionSecret,
  resave: false,
  saveUninitialized: true,
  store: new Memorystore({ checkPeriod: maxAge }),
  cookie: {
    maxAge: maxAge,
  },
};

const clientSecret: string = await config.clientSecret;
const komqWorldApiToken: string = await config.komqWorldApiToken;

async function main() {
  const app = express();

  app.use(express.urlencoded({ extended: true }));
  app.use(session(sessionObj));
  app.use(cookieParser(sessionSecret));

  const port = 4568;

  auth = new Auth({
    client_id: "d17f6481-6606-4601-9e74-9c9ff96f83af",
    clientSecret: clientSecret,
    redirect: "https://authorization.komq.world/",
  });

  app.get("/", async (req, res) => {
    const query = req.query;
    const session = req.session;
    const d = query.d as string;
    const u = query.u as string;
    const n = query.n as string;
    const c = query.c as string;

    if (session && session.c) {
      try {
        await authorization(
          decrypt(session.d!!),
          decrypt(session.u!!),
          decrypt(session.n!!),
          session.c
        );

        req.session.d = "";
        req.session.u = "";
        req.session.n = "";
        req.session.c = "";

        res.send(
          "인증을 성공적으로 완료했습니다. 이제 이 창을 닫아도 좋습니다."
        );
      } catch (e) {
        console.error(e);
      }
    } else if (d && u && n) {
      req.session.d = d;
      req.session.u = u;
      req.session.n = n;

      res.redirect(auth.createLink());
    } else if (c) {
      req.session.c = c;

      res.redirect("/");
    } else res.redirect("https://github.com/Komtents/komtents-authorization/");
  });

  app.listen(port);
}

async function authorization(d: string, u: string, n: string, c: string) {
  const xbox = await auth.login(c);

  const mc = await xbox.getMinecraft();
  const profile = mc.profile;
  const token = mc.mcToken;

  const createdAt = await axios
    .get("https://api.minecraftservices.com/minecraft/profile/namechange", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    .then((res) => res.data.createdAt)
    .catch((err) => {
      console.log(err);
      return null;
    });

  if (profile?.name === n && profile.id === u) {
    try {
      await axios.post(
        config.API,
        {
          discord_id: d,
          minecraft_username: profile?.name,
          minecraft_uuid: profile?.id,
          minecraft_createdAt: createdAt,
        },
        { headers: { Authorization: `Bearer ${komqWorldApiToken}` } }
      );
    } catch (e) {
      if (e instanceof AxiosError && e.response?.status === 502) {
        console.error("ERROR: API SERVER IS DOWN!!!!!!!!!");
      }
    }
  }
}

main().catch(console.error);
