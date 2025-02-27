/**
 * @jest-environment miniflare
 * @jest-environment-options {"modules":"true","r2Buckets":["AVATAR_BUCKET"],"bindings":{"WEB3_ENDPOINT":"http://localhost/","REGISTRY_ADDRESS":"0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e","WRAPPER_ADDRESS":"{ \"mainnet\": \"0x582224b8d4534F4749EFA4f22eF7241E0C56D4B8\" }"}}
 */

import onRequestPut from "@/put";
import { EMPTY_ADDRESS } from "@/utils";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { mockOwnersAvailability, ResObj } from "./test-utils";

const j = (import.meta as any).jest as typeof jest;

const dataURLToBytes = (dataURL: string) => {
  const base64 = dataURL.split(",")[1];
  const mime = dataURL.split(",")[0].split(":")[1].split(";")[0];
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return { mime, bytes };
};

const account = mnemonicToAccount(
  "test test test test test test test test test test test junk"
);
const expiry = String(Date.now() + 100000);
const name = "test.eth";

const walletAddress = account.address;

const makeHash = (dataURL: string) =>
  bytesToHex(sha256(dataURLToBytes(dataURL).bytes));

const makeSig = ({
  upload = "avatar",
  expiry: expiry_ = expiry,
  name: name_ = name,
  dataURL,
}: {
  upload?: string;
  expiry?: string;
  name?: string;
  dataURL: string;
}) =>
  account.signTypedData({
    domain: {
      name: "Ethereum Name Service",
      version: "1",
    },
    types: {
      Upload: [
        { name: "upload", type: "string" },
        { name: "expiry", type: "string" },
        { name: "name", type: "string" },
        { name: "hash", type: "string" },
      ],
    },
    primaryType: "Upload",
    message: {
      upload,
      expiry: expiry_,
      name: name_,
      hash: makeHash(dataURL),
    },
  });

describe("put", () => {
  it("throws error if fetch returns error", async () => {
    j.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response("{}", { status: 500 });
    });
    const dataURL = "data:image/jpeg;base64,test123123";

    const request = new Request("http://localhost/mainnet/test.eth", {
      body: JSON.stringify({
        expiry,
        dataURL,
        sig: await makeSig({ dataURL }),
      }),
      method: "PUT",
    });

    try {
      await onRequestPut(
        request,
        getMiniflareBindings() as any,
        {} as any,
        name,
        "mainnet"
      );
      expect(false).toBeTruthy();
    } catch (e) {
      expect(e).toBeDefined();
    }
  });
  it("returns error if image is too large", async () => {
    mockOwnersAvailability(walletAddress, EMPTY_ADDRESS, true, false);

    const dataURL =
      "data:image/jpeg;base64," +
      Array(512 * 1024)
        .fill(0)
        .map(() => Math.floor(Math.random() * 256).toString(16))
        .join("");

    const request = new Request("http://localhost/mainnet/test.eth", {
      body: JSON.stringify({
        expiry,
        dataURL,
        sig: await makeSig({ dataURL }),
      }),
      method: "PUT",
    });

    const response = await onRequestPut(
      request,
      getMiniflareBindings() as any,
      {} as any,
      name,
      "mainnet"
    );
    const { message } = await response.json<ResObj>();

    expect(message).toBe("Image is too large");
    expect(response.status).toBe(413);
  });
  it("returns error if owner is not name owner", async () => {
    mockOwnersAvailability(
      "0x0000000000000000000000000000000000000001",
      EMPTY_ADDRESS,
      true,
      false
    );

    const dataURL = "data:image/jpeg;base64,test123123";

    const request = new Request("http://localhost/mainnet/test.eth", {
      body: JSON.stringify({
        expiry,
        dataURL,
        sig: await makeSig({ dataURL }),
      }),
      method: "PUT",
    });

    const response = await onRequestPut(
      request,
      getMiniflareBindings() as any,
      {} as any,
      name,
      "mainnet"
    );
    const { message } = await response.json<ResObj>();

    expect(message).toBe(
      `Address ${walletAddress} is not the owner of test.eth`
    );
    expect(response.status).toBe(403);
  });
  it("returns error if signature has expired", async () => {
    mockOwnersAvailability(walletAddress, EMPTY_ADDRESS, true, false);

    const dataURL = "data:image/jpeg;base64,test123123";

    const request = new Request("http://localhost/mainnet/test.eth", {
      body: JSON.stringify({
        expiry: "1",
        dataURL,
        sig: await makeSig({
          expiry: "1",
          dataURL,
        }),
      }),
      method: "PUT",
    });

    const response = await onRequestPut(
      request,
      getMiniflareBindings() as any,
      {} as any,
      name,
      "mainnet"
    );
    const { message } = await response.json<ResObj>();

    expect(message).toBe("Signature expired");
    expect(response.status).toBe(403);
  });
  it('returns error if mime type is not "image/jpeg"', async () => {
    mockOwnersAvailability(walletAddress, EMPTY_ADDRESS, true, false);

    const dataURL = "data:text/html;base64,test123123";

    const request = new Request("http://localhost/mainnet/test.eth", {
      body: JSON.stringify({
        expiry: "1",
        dataURL,
        sig: await makeSig({
          expiry: "1",
          dataURL,
        }),
      }),
      method: "PUT",
    });

    const response = await onRequestPut(
      request,
      getMiniflareBindings() as any,
      {} as any,
      name,
      "mainnet"
    );
    const { message } = await response.json<ResObj>();

    expect(message).toBe("File must be of type image/jpeg");
    expect(response.status).toBe(403);
  });
  it("uploads image if name is available", async () => {
    mockOwnersAvailability(EMPTY_ADDRESS, EMPTY_ADDRESS, true, true);

    const dataURL = "data:image/jpeg;base64,test123123";

    const request = new Request("http://localhost/mainnet/test.eth", {
      body: JSON.stringify({
        expiry,
        dataURL,
        sig: await makeSig({ dataURL }),
      }),
      method: "PUT",
    });

    const response = await onRequestPut(
      request,
      getMiniflareBindings() as any,
      {} as any,
      name,
      "mainnet"
    );
    const { message } = await response.json<ResObj>();

    expect(message).toBe("uploaded");
    expect(response.status).toBe(200);

    const AVATAR_BUCKET = getMiniflareBindings().AVATAR_BUCKET;
    const result = await AVATAR_BUCKET.get(
      "mainnet/unregistered/test.eth/" + walletAddress
    );
    const buffer = await result!.arrayBuffer();
    expect(buffer).toEqual(dataURLToBytes(dataURL).bytes.buffer);
  });
  it("uploads image if checks pass", async () => {
    mockOwnersAvailability(walletAddress, EMPTY_ADDRESS, true, false);

    const dataURL = "data:image/jpeg;base64,test123123";

    const request = new Request("http://localhost/mainnet/test.eth", {
      body: JSON.stringify({
        expiry,
        dataURL,
        sig: await makeSig({ dataURL }),
      }),
      method: "PUT",
    });

    const response = await onRequestPut(
      request,
      getMiniflareBindings() as any,
      {} as any,
      name,
      "mainnet"
    );
    const { message } = await response.json<ResObj>();

    expect(message).toBe("uploaded");
    expect(response.status).toBe(200);

    const AVATAR_BUCKET = getMiniflareBindings().AVATAR_BUCKET;
    const result = await AVATAR_BUCKET.get("mainnet/registered/test.eth");
    const buffer = await result!.arrayBuffer();
    expect(buffer).toEqual(dataURLToBytes(dataURL).bytes.buffer);
  });
});
