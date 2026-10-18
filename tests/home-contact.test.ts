import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { Children, isValidElement, type FormEvent, type ReactNode } from "react";
import ts from "typescript";
import { submitHomeContact } from "../src/components/home/contact";

const payload = { name: "Jane", email: "jane@example.com", message: "Hello\nTaiwan", company: "", locale: "en" };
const fallback = "Please try again";

test("首頁聯絡表單以既有契約送出，接受 received 成功回應", async () => {
  let calls = 0;
  await submitHomeContact(payload, fallback, async (url, init) => {
    calls++;
    assert.equal(url, "/api/contact");
    assert.equal(init?.method, "POST");
    assert.deepEqual(init?.headers, { "Content-Type": "application/json" });
    assert.deepEqual(JSON.parse(String(init?.body)), payload);
    return Response.json({ data: { received: true } }, { status: 201 });
  });
  assert.equal(calls, 1);
});

test("400 驗證錯誤保留完整多行訊息", async () => {
  await assert.rejects(submitHomeContact(payload, fallback, async () => Response.json({
    error: "Name is required\nEmail is invalid\nMessage is too long",
  }, { status: 400 })), { message: "HTTP 400: Name is required\nEmail is invalid\nMessage is too long" });
});

test("429 限流顯示伺服器錯誤與 HTTP 狀態", async () => {
  await assert.rejects(submitHomeContact(payload, fallback, async () => Response.json({
    error: "請求過於頻繁，請稍後重試 / Too many attempts; try again later", code: "tooManyAttempts",
  }, { status: 429 })), { message: "HTTP 429: 請求過於頻繁，請稍後重試 / Too many attempts; try again later" });
});

test("500 追蹤碼只顯示一次，獨立回傳時附加追蹤碼", async () => {
  for (const includesReference of [false, true]) {
    const requestId = "request-012345";
    const error = includesReference ? `Please retry later. Reference: ${requestId}` : "Please retry later.";
    await assert.rejects(submitHomeContact(payload, fallback, async () => Response.json({
      error, requestId,
    }, { status: 500 })), (cause: unknown) => {
      assert.ok(cause instanceof Error);
      assert.equal(cause.message, `HTTP 500: ${error}${includesReference ? "" : `\nReference: ${requestId}`}`);
      assert.equal(cause.message.split(requestId).length - 1, 1);
      return true;
    });
  }
});

test("網路失敗保留原始錯誤供前端顯示", async () => {
  await assert.rejects(submitHomeContact(payload, fallback, async () => {
    throw new TypeError("Failed to fetch\nNetwork connection lost");
  }), { message: "Failed to fetch\nNetwork connection lost" });
});

test("非 JSON 或空回應保留原始內容及 HTTP 狀態", async () => {
  await assert.rejects(submitHomeContact(payload, fallback, async () => new Response("<h1>Bad gateway</h1>\nUpstream unavailable", {
    status: 502,
  })), { message: "HTTP 502: <h1>Bad gateway</h1>\nUpstream unavailable" });
  await assert.rejects(submitHomeContact(payload, fallback, async () => new Response(null, {
    status: 503,
  })), { message: "HTTP 503: Please try again" });
});

test("成功 HTTP 卻缺少確認資料，不會誤報送出成功", async () => {
  await assert.rejects(submitHomeContact(payload, fallback, async () => Response.json({ data: null }, { status: 200 })), {
    message: 'HTTP 200: {"data":null}',
  });
});

test("表單阻擋快速重送，失敗保留輸入，重試成功才清空", async () => {
  const state: unknown[] = [];
  let cursor = 0;
  let calls = 0;
  let complete!: (response: Response) => void;
  const fetcher: typeof fetch = async () => {
    calls++;
    return new Promise<Response>((resolve) => { complete = resolve; });
  };
  const require = createRequire(import.meta.url);
  const loaded = { exports: {} as { default: (props: object) => ReactNode } };
  const code = ts.transpileModule(readFileSync("src/components/home/HomeContactForm.tsx", "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(code, {
    module: loaded, exports: loaded.exports, Error,
    require: (id: string) => {
      if (id === "react") return {
        useId: () => "test-contact",
        useRef: (initial: unknown) => {
          const index = cursor++;
          if (!(index in state)) state[index] = { current: initial };
          return state[index];
        },
        useState: (initial: unknown) => {
          const index = cursor++;
          if (!(index in state)) state[index] = initial;
          return [state[index], (value: unknown) => { state[index] = value; }];
        },
      };
      if (id === "./contact") return {
        submitHomeContact: (data: typeof payload, error: string) => submitHomeContact(data, error, fetcher),
      };
      if (id.endsWith(".css")) return { default: {} };
      return require(id);
    },
    FormData: class {
      constructor(private form: { values: Record<string, string> }) {}
      get(name: string) { return this.form.values[name] ?? null; }
    },
  });
  type Props = {
    children?: ReactNode;
    role?: string;
    disabled?: boolean;
    "aria-busy"?: boolean;
    onSubmit?: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  };
  function render() {
    cursor = 0;
    const elements: { type: unknown; props: Props }[] = [];
    function visit(node: ReactNode) {
      Children.forEach(node, (child) => {
        if (isValidElement<Props>(child)) { elements.push(child); visit(child.props.children); }
      });
    }
    visit(loaded.exports.default({
      locale: "en",
      labels: { name: "Name", email: "Email", message: "Message", send: "Send", sending: "Sending", success: "Received", error: fallback },
    }));
    return elements;
  }
  let resets = 0;
  const form = { values: { ...payload }, reset: () => { resets++; } };
  const event = { preventDefault() {}, currentTarget: form } as unknown as FormEvent<HTMLFormElement>;
  const submit = () => render().find((element) => element.type === "form")!.props.onSubmit!(event);
  const first = submit();
  assert.equal(render().find((element) => element.type === "button")!.props.disabled, true);
  assert.equal(render().find((element) => element.type === "form")!.props["aria-busy"], true);
  await submit();
  assert.equal(calls, 1);
  complete(Response.json({ error: "Please retry\nReference: trace-123", requestId: "trace-123" }, { status: 500 }));
  await first;
  assert.equal(resets, 0);
  assert.deepEqual(form.values, payload);
  assert.equal(render().find((element) => element.props.role === "alert")!.props.children, "HTTP 500: Please retry\nReference: trace-123");
  assert.equal(render().find((element) => element.type === "button")!.props.disabled, false);
  const retry = submit();
  complete(Response.json({ data: { received: true } }, { status: 201 }));
  await retry;
  assert.equal(calls, 2);
  assert.equal(resets, 1);
  assert.equal(render().find((element) => element.props.role === "alert"), undefined);
  assert.equal(render().find((element) => element.props.role === "status")!.props.children, "Received");
});
