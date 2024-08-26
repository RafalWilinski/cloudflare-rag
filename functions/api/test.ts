import { Env } from "worker-configuration";

export const onRequest: PagesFunction<Env> = async (context) => {
  return new Response("Hello, world!" + context.env.MY_VARIABLE + Math.random())
}