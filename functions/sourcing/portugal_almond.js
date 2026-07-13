export async function onRequest(context) {
  return context.env.PDF_SERVICE.fetch(context.request);
}
