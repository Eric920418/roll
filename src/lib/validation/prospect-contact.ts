import "server-only";
import { lookup } from "node:dns";
import { get } from "node:https";
import { isIP } from "node:net";
import { publicWebsite, type ProspectCompany } from "./prospect-schema";

export function publicProspectAddress(address: string) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return a! > 0 && a! < 224 && a !== 10 && a !== 127 &&
    !(a === 100 && b! >= 64 && b! <= 127) && !(a === 169 && b === 254) &&
    !(a === 172 && b! >= 16 && b! <= 31) && !(a === 192 && (b === 168 || b === 0)) &&
    !(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) &&
    !(a === 203 && b === 0 && c === 113) && address !== "168.63.129.16";
}

// Pin public IPv4 DNS results to the TLS connection; never follow a redirect into private networks.
export async function reachableProspectContact(company: ProspectCompany) {
  if (!company.contact) return false;
  const host = new URL(company.website).hostname.replace(/^www\./, "");
  let url = company.contact.source.url;
  const signal = AbortSignal.timeout(7000);
  for (let redirects = 0; redirects <= 2; redirects++) {
    if (!publicWebsite(url)) return false;
    const targetHost = new URL(url).hostname.replace(/^www\./, "");
    if (targetHost !== host && !targetHost.endsWith(`.${host}`)) return false;
    const response = await new Promise<{ status: number; location?: string; type?: string } | null>(resolve => {
      const request = get(url, {
        family: 4, signal, headers: { "User-Agent": "NOVA-Contact-Check/1.0" },
        lookup: (hostname, _options, callback) => lookup(hostname, { family: 4, all: true }, (error, addresses) => {
          const address = addresses?.find(a => publicProspectAddress(a.address));
          if (error || !address) callback(error || new Error("Public address required"), "", 4);
          else callback(null, address.address, 4);
        }),
      }, result => {
        resolve({ status: result.statusCode || 0, location: result.headers.location, type: result.headers["content-type"] });
        result.destroy();
      });
      request.on("error", () => resolve(null));
    });
    if (!response) return false;
    if (response.status >= 200 && response.status < 300) return /text\/html|application\/xhtml\+xml/i.test(response.type || "");
    if (![301, 302, 303, 307, 308].includes(response.status) || !response.location) return false;
    try { url = new URL(response.location, url).href; } catch { return false; }
  }
  return false;
}
