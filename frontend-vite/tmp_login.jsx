import { createHotContext as __vite__createHotContext } from "/@vite/client";
import.meta.hot = __vite__createHotContext("/src/components/Login.jsx");
const useState = __vite__cjsImport0_react["useState"];
const _jsxDEV = __vite__cjsImport5_react_jsxDevRuntime["jsxDEV"];
import __vite__cjsImport0_react from "/node_modules/.vite/deps/react.js?v=26363500";
import { motion } from "/node_modules/.vite/deps/framer-motion.js?v=26363500";
import { loginUser } from "/src/api/backend.js";
import loginBackground from "/src/assets/images/loginbgimage.webp?import";
import logoMark from "/src/assets/images/TPCLOGOONLY.png?import";
var _jsxFileName =
  "C:/Users/TPC-USER/Desktop/AUTO-QA-TPC/frontend-vite/src/components/Login.jsx";
import __vite__cjsImport5_react_jsxDevRuntime from "/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=26363500";
var _s = $RefreshSig$();
function Login({ onLogin, apiMessage }) {
  _s();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    if (!username || !password) {
      setErrorMessage("Username and password are required.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await loginUser({
        username,
        password,
      });
      const { access, refresh } = response.data;
      if (!access) {
        setErrorMessage("Login succeeded but no access token was returned.");
        return;
      }
      localStorage.setItem("token", access);
      if (refresh) {
        localStorage.setItem("refresh", refresh);
      }
      onLogin(access);
    } catch (error) {
      setErrorMessage(
        error.response?.data?.detail ||
          error.response?.data?.error ||
          "Login failed. Check your credentials and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };
  return /* @__PURE__ */ _jsxDEV(
    "div",
    {
      className: "auth-shell",
      style: { backgroundImage: `url(${loginBackground})` },
      children: [
        /* @__PURE__ */ _jsxDEV(
          "div",
          {
            className: "animated-bg-container",
            children: [
              /* @__PURE__ */ _jsxDEV(
                motion.div,
                {
                  className: "floating-orb floating-orb--1",
                  animate: {
                    y: [0, -20, 0],
                    x: [0, 10, 0],
                  },
                  transition: {
                    duration: 8,
                    repeat: Infinity,
                    ease: "easeInOut",
                  },
                },
                void 0,
                false,
                {
                  fileName: _jsxFileName,
                  lineNumber: 57,
                  columnNumber: 9,
                },
                this,
              ),
              /* @__PURE__ */ _jsxDEV(
                motion.div,
                {
                  className: "floating-orb floating-orb--2",
                  animate: {
                    y: [0, -25, 0],
                    x: [0, -15, 0],
                  },
                  transition: {
                    duration: 10,
                    repeat: Infinity,
                    ease: "easeInOut",
                  },
                },
                void 0,
                false,
                {
                  fileName: _jsxFileName,
                  lineNumber: 69,
                  columnNumber: 9,
                },
                this,
              ),
              /* @__PURE__ */ _jsxDEV(
                motion.div,
                {
                  className: "floating-orb floating-orb--3",
                  animate: {
                    y: [0, -15, 0],
                    x: [0, 20, 0],
                  },
                  transition: {
                    duration: 9,
                    repeat: Infinity,
                    ease: "easeInOut",
                  },
                },
                void 0,
                false,
                {
                  fileName: _jsxFileName,
                  lineNumber: 81,
                  columnNumber: 9,
                },
                this,
              ),
              /* @__PURE__ */ _jsxDEV(
                motion.div,
                {
                  className: "animated-gradient",
                  animate: {
                    backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                  },
                  transition: {
                    duration: 6,
                    repeat: Infinity,
                    ease: "easeInOut",
                  },
                },
                void 0,
                false,
                {
                  fileName: _jsxFileName,
                  lineNumber: 93,
                  columnNumber: 9,
                },
                this,
              ),
            ],
          },
          void 0,
          true,
          {
            fileName: _jsxFileName,
            lineNumber: 56,
            columnNumber: 7,
          },
          this,
        ),
        /* @__PURE__ */ _jsxDEV(
          "div",
          { className: "auth-shell__overlay" },
          void 0,
          false,
          {
            fileName: _jsxFileName,
            lineNumber: 106,
            columnNumber: 7,
          },
          this,
        ),
        /* @__PURE__ */ _jsxDEV(
          motion.section,
          {
            className: "auth-card",
            initial: {
              opacity: 0,
              y: 20,
            },
            animate: {
              opacity: 1,
              y: 0,
            },
            transition: {
              duration: 0.6,
              ease: "easeOut",
            },
            children: [
              /* @__PURE__ */ _jsxDEV(
                motion.div,
                {
                  className: "auth-brand",
                  initial: {
                    opacity: 0,
                    scale: 0.9,
                  },
                  animate: {
                    opacity: 1,
                    scale: 1,
                  },
                  transition: {
                    duration: 0.5,
                    delay: 0.2,
                  },
                  children: [
                    /* @__PURE__ */ _jsxDEV(
                      motion.div,
                      {
                        className: "auth-brand__mark",
                        children: /* @__PURE__ */ _jsxDEV(
                          "img",
                          {
                            src: logoMark,
                            alt: "Team Pacific Corporation",
                          },
                          void 0,
                          false,
                          {
                            fileName: _jsxFileName,
                            lineNumber: 123,
                            columnNumber: 13,
                          },
                          this,
                        ),
                      },
                      void 0,
                      false,
                      {
                        fileName: _jsxFileName,
                        lineNumber: 120,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    /* @__PURE__ */ _jsxDEV(
                      motion.h1,
                      {
                        initial: { opacity: 0 },
                        animate: { opacity: 1 },
                        transition: {
                          duration: 0.5,
                          delay: 0.4,
                        },
                        children: "IC DETECTION",
                      },
                      void 0,
                      false,
                      {
                        fileName: _jsxFileName,
                        lineNumber: 125,
                        columnNumber: 11,
                      },
                      this,
                    ),
                  ],
                },
                void 0,
                true,
                {
                  fileName: _jsxFileName,
                  lineNumber: 114,
                  columnNumber: 9,
                },
                this,
              ),
              /* @__PURE__ */ _jsxDEV(
                motion.div,
                {
                  className: "auth-card__title",
                  initial: { opacity: 0 },
                  animate: { opacity: 1 },
                  transition: {
                    duration: 0.5,
                    delay: 0.3,
                  },
                  children: /* @__PURE__ */ _jsxDEV(
                    "h2",
                    { children: "Login" },
                    void 0,
                    false,
                    {
                      fileName: _jsxFileName,
                      lineNumber: 140,
                      columnNumber: 11,
                    },
                    this,
                  ),
                },
                void 0,
                false,
                {
                  fileName: _jsxFileName,
                  lineNumber: 134,
                  columnNumber: 9,
                },
                this,
              ),
              apiMessage
                ? /* @__PURE__ */ _jsxDEV(
                    motion.div,
                    {
                      className: "notice notice--info",
                      initial: {
                        opacity: 0,
                        y: -6,
                      },
                      animate: {
                        opacity: 1,
                        y: 0,
                      },
                      transition: {
                        duration: 0.3,
                        delay: 0.3,
                      },
                      "aria-live": "polite",
                      children: apiMessage,
                    },
                    void 0,
                    false,
                    {
                      fileName: _jsxFileName,
                      lineNumber: 144,
                      columnNumber: 11,
                    },
                    this,
                  )
                : null,
              /* @__PURE__ */ _jsxDEV(
                motion.form,
                {
                  className: "auth-form",
                  onSubmit: handleSubmit,
                  initial: { opacity: 0 },
                  animate: { opacity: 1 },
                  transition: {
                    duration: 0.5,
                    delay: 0.4,
                  },
                  children: [
                    /* @__PURE__ */ _jsxDEV(
                      motion.label,
                      {
                        className: "field field--login",
                        initial: {
                          opacity: 0,
                          x: -20,
                        },
                        animate: {
                          opacity: 1,
                          x: 0,
                        },
                        transition: {
                          duration: 0.4,
                          delay: 0.45,
                        },
                        children: [
                          /* @__PURE__ */ _jsxDEV(
                            "span",
                            { children: "Username" },
                            void 0,
                            false,
                            {
                              fileName: _jsxFileName,
                              lineNumber: 168,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          /* @__PURE__ */ _jsxDEV(
                            "div",
                            {
                              className: "field-control",
                              children: /* @__PURE__ */ _jsxDEV(
                                "input",
                                {
                                  className: "auth-form__input",
                                  value: username,
                                  onChange: (event) =>
                                    setUsername(event.target.value),
                                  type: "text",
                                  autoComplete: "username",
                                  placeholder: "Enter your username",
                                },
                                void 0,
                                false,
                                {
                                  fileName: _jsxFileName,
                                  lineNumber: 170,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                            },
                            void 0,
                            false,
                            {
                              fileName: _jsxFileName,
                              lineNumber: 169,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        ],
                      },
                      void 0,
                      true,
                      {
                        fileName: _jsxFileName,
                        lineNumber: 162,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    /* @__PURE__ */ _jsxDEV(
                      motion.label,
                      {
                        className: "field field--login",
                        initial: {
                          opacity: 0,
                          x: -20,
                        },
                        animate: {
                          opacity: 1,
                          x: 0,
                        },
                        transition: {
                          duration: 0.4,
                          delay: 0.5,
                        },
                        children: [
                          /* @__PURE__ */ _jsxDEV(
                            "span",
                            { children: "Password" },
                            void 0,
                            false,
                            {
                              fileName: _jsxFileName,
                              lineNumber: 187,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          /* @__PURE__ */ _jsxDEV(
                            "div",
                            {
                              className: "field-control",
                              children: /* @__PURE__ */ _jsxDEV(
                                "input",
                                {
                                  className: "auth-form__input",
                                  value: password,
                                  onChange: (event) =>
                                    setPassword(event.target.value),
                                  type: "password",
                                  autoComplete: "current-password",
                                  placeholder: "Enter your password",
                                },
                                void 0,
                                false,
                                {
                                  fileName: _jsxFileName,
                                  lineNumber: 189,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                            },
                            void 0,
                            false,
                            {
                              fileName: _jsxFileName,
                              lineNumber: 188,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        ],
                      },
                      void 0,
                      true,
                      {
                        fileName: _jsxFileName,
                        lineNumber: 181,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    errorMessage
                      ? /* @__PURE__ */ _jsxDEV(
                          motion.div,
                          {
                            className: "notice notice--error",
                            initial: {
                              opacity: 0,
                              y: -10,
                            },
                            animate: {
                              opacity: 1,
                              y: 0,
                            },
                            transition: { duration: 0.3 },
                            children: errorMessage,
                          },
                          void 0,
                          false,
                          {
                            fileName: _jsxFileName,
                            lineNumber: 201,
                            columnNumber: 13,
                          },
                          this,
                        )
                      : null,
                    /* @__PURE__ */ _jsxDEV(
                      motion.button,
                      {
                        className: "primary-button primary-button--login",
                        type: "submit",
                        disabled: isSubmitting,
                        whileHover: { scale: 1.02 },
                        whileTap: { scale: 0.98 },
                        initial: {
                          opacity: 0,
                          y: 10,
                        },
                        animate: {
                          opacity: 1,
                          y: 0,
                        },
                        transition: {
                          duration: 0.4,
                          delay: 0.55,
                        },
                        children: isSubmitting ? "Signing in..." : "Login",
                      },
                      void 0,
                      false,
                      {
                        fileName: _jsxFileName,
                        lineNumber: 211,
                        columnNumber: 11,
                      },
                      this,
                    ),
                  ],
                },
                void 0,
                true,
                {
                  fileName: _jsxFileName,
                  lineNumber: 155,
                  columnNumber: 9,
                },
                this,
              ),
            ],
          },
          void 0,
          true,
          {
            fileName: _jsxFileName,
            lineNumber: 108,
            columnNumber: 7,
          },
          this,
        ),
      ],
    },
    void 0,
    true,
    {
      fileName: _jsxFileName,
      lineNumber: 51,
      columnNumber: 5,
    },
    this,
  );
}
_s(Login, "QrH0g71yw3SoK2aeXKx6xtYwKVA=");
_c = Login;
export default Login;
var _c;
$RefreshReg$(_c, "Login");
import * as RefreshRuntime from "/@react-refresh";
const inWebWorker =
  typeof globalThis.WorkerGlobalScope !== "undefined" &&
  self instanceof globalThis.WorkerGlobalScope;
import * as __vite_react_currentExports from "/src/components/Login.jsx";
if (import.meta.hot && !inWebWorker) {
  if (!window.$RefreshReg$) {
    throw new Error(
      "@vitejs/plugin-react can't detect preamble. Something is wrong.",
    );
  }

  const currentExports = __vite_react_currentExports;
  queueMicrotask(() => {
    RefreshRuntime.registerExportsForReactRefresh(
      "C:/Users/TPC-USER/Desktop/AUTO-QA-TPC/frontend-vite/src/components/Login.jsx",
      currentExports,
    );
    import.meta.hot.accept((nextExports) => {
      if (!nextExports) return;
      const invalidateMessage =
        RefreshRuntime.validateRefreshBoundaryAndEnqueueUpdate(
          "C:/Users/TPC-USER/Desktop/AUTO-QA-TPC/frontend-vite/src/components/Login.jsx",
          currentExports,
          nextExports,
        );
      if (invalidateMessage) import.meta.hot.invalidate(invalidateMessage);
    });
  });
}
function $RefreshReg$(type, id) {
  return RefreshRuntime.register(
    type,
    "C:/Users/TPC-USER/Desktop/AUTO-QA-TPC/frontend-vite/src/components/Login.jsx" +
      " " +
      id,
  );
}
function $RefreshSig$() {
  return RefreshRuntime.createSignatureFunctionForTransform();
}

//# sourceMappingURL=data:application/json;base64,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Ozs7Ozs7O3lDQUVUOztBQUVELGVBQWUiLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiTG9naW4uanN4Il0sInZlcnNpb24iOjMsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHVzZVN0YXRlIH0gZnJvbSBcInJlYWN0XCI7XHJcbmltcG9ydCB7IG1vdGlvbiB9IGZyb20gXCJmcmFtZXItbW90aW9uXCI7XHJcbmltcG9ydCB7IGxvZ2luVXNlciB9IGZyb20gXCIuLi9hcGkvYmFja2VuZFwiO1xyXG5pbXBvcnQgbG9naW5CYWNrZ3JvdW5kIGZyb20gXCIuLi9hc3NldHMvaW1hZ2VzL2xvZ2luYmdpbWFnZS53ZWJwXCI7XHJcbmltcG9ydCBsb2dvTWFyayBmcm9tIFwiLi4vYXNzZXRzL2ltYWdlcy9UUENMT0dPT05MWS5wbmdcIjtcclxuXHJcbmZ1bmN0aW9uIExvZ2luKHsgb25Mb2dpbiwgYXBpTWVzc2FnZSB9KSB7XHJcbiAgY29uc3QgW3VzZXJuYW1lLCBzZXRVc2VybmFtZV0gPSB1c2VTdGF0ZShcIlwiKTtcclxuICBjb25zdCBbcGFzc3dvcmQsIHNldFBhc3N3b3JkXSA9IHVzZVN0YXRlKFwiXCIpO1xyXG4gIGNvbnN0IFtlcnJvck1lc3NhZ2UsIHNldEVycm9yTWVzc2FnZV0gPSB1c2VTdGF0ZShcIlwiKTtcclxuICBjb25zdCBbaXNTdWJtaXR0aW5nLCBzZXRJc1N1Ym1pdHRpbmddID0gdXNlU3RhdGUoZmFsc2UpO1xyXG5cclxuICBjb25zdCBoYW5kbGVTdWJtaXQgPSBhc3luYyAoZXZlbnQpID0+IHtcclxuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICBzZXRFcnJvck1lc3NhZ2UoXCJcIik7XHJcblxyXG4gICAgaWYgKCF1c2VybmFtZSB8fCAhcGFzc3dvcmQpIHtcclxuICAgICAgc2V0RXJyb3JNZXNzYWdlKFwiVXNlcm5hbWUgYW5kIHBhc3N3b3JkIGFyZSByZXF1aXJlZC5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBzZXRJc1N1Ym1pdHRpbmcodHJ1ZSk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBsb2dpblVzZXIoeyB1c2VybmFtZSwgcGFzc3dvcmQgfSk7XHJcbiAgICAgIGNvbnN0IHsgYWNjZXNzLCByZWZyZXNoIH0gPSByZXNwb25zZS5kYXRhO1xyXG5cclxuICAgICAgaWYgKCFhY2Nlc3MpIHtcclxuICAgICAgICBzZXRFcnJvck1lc3NhZ2UoXCJMb2dpbiBzdWNjZWVkZWQgYnV0IG5vIGFjY2VzcyB0b2tlbiB3YXMgcmV0dXJuZWQuXCIpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oXCJ0b2tlblwiLCBhY2Nlc3MpO1xyXG4gICAgICBpZiAocmVmcmVzaCkge1xyXG4gICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFwicmVmcmVzaFwiLCByZWZyZXNoKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgb25Mb2dpbihhY2Nlc3MpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgc2V0RXJyb3JNZXNzYWdlKFxyXG4gICAgICAgIGVycm9yLnJlc3BvbnNlPy5kYXRhPy5kZXRhaWwgfHxcclxuICAgICAgICAgIGVycm9yLnJlc3BvbnNlPy5kYXRhPy5lcnJvciB8fFxyXG4gICAgICAgICAgXCJMb2dpbiBmYWlsZWQuIENoZWNrIHlvdXIgY3JlZGVudGlhbHMgYW5kIHRyeSBhZ2Fpbi5cIixcclxuICAgICAgKTtcclxuICAgIH0gZmluYWxseSB7XHJcbiAgICAgIHNldElzU3VibWl0dGluZyhmYWxzZSk7XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgcmV0dXJuIChcclxuICAgIDxkaXZcclxuICAgICAgY2xhc3NOYW1lPVwiYXV0aC1zaGVsbFwiXHJcbiAgICAgIHN0eWxlPXt7IGJhY2tncm91bmRJbWFnZTogYHVybCgke2xvZ2luQmFja2dyb3VuZH0pYCB9fVxyXG4gICAgPlxyXG4gICAgICB7LyogQW5pbWF0ZWQgYmFja2dyb3VuZCBlbGVtZW50cyAqL31cclxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJhbmltYXRlZC1iZy1jb250YWluZXJcIj5cclxuICAgICAgICA8bW90aW9uLmRpdlxyXG4gICAgICAgICAgY2xhc3NOYW1lPVwiZmxvYXRpbmctb3JiIGZsb2F0aW5nLW9yYi0tMVwiXHJcbiAgICAgICAgICBhbmltYXRlPXt7XHJcbiAgICAgICAgICAgIHk6IFswLCAtMjAsIDBdLFxyXG4gICAgICAgICAgICB4OiBbMCwgMTAsIDBdLFxyXG4gICAgICAgICAgfX1cclxuICAgICAgICAgIHRyYW5zaXRpb249e3tcclxuICAgICAgICAgICAgZHVyYXRpb246IDgsXHJcbiAgICAgICAgICAgIHJlcGVhdDogSW5maW5pdHksXHJcbiAgICAgICAgICAgIGVhc2U6IFwiZWFzZUluT3V0XCIsXHJcbiAgICAgICAgICB9fVxyXG4gICAgICAgIC8+XHJcbiAgICAgICAgPG1vdGlvbi5kaXZcclxuICAgICAgICAgIGNsYXNzTmFtZT1cImZsb2F0aW5nLW9yYiBmbG9hdGluZy1vcmItLTJcIlxyXG4gICAgICAgICAgYW5pbWF0ZT17e1xyXG4gICAgICAgICAgICB5OiBbMCwgLTI1LCAwXSxcclxuICAgICAgICAgICAgeDogWzAsIC0xNSwgMF0sXHJcbiAgICAgICAgICB9fVxyXG4gICAgICAgICAgdHJhbnNpdGlvbj17e1xyXG4gICAgICAgICAgICBkdXJhdGlvbjogMTAsXHJcbiAgICAgICAgICAgIHJlcGVhdDogSW5maW5pdHksXHJcbiAgICAgICAgICAgIGVhc2U6IFwiZWFzZUluT3V0XCIsXHJcbiAgICAgICAgICB9fVxyXG4gICAgICAgIC8+XHJcbiAgICAgICAgPG1vdGlvbi5kaXZcclxuICAgICAgICAgIGNsYXNzTmFtZT1cImZsb2F0aW5nLW9yYiBmbG9hdGluZy1vcmItLTNcIlxyXG4gICAgICAgICAgYW5pbWF0ZT17e1xyXG4gICAgICAgICAgICB5OiBbMCwgLTE1LCAwXSxcclxuICAgICAgICAgICAgeDogWzAsIDIwLCAwXSxcclxuICAgICAgICAgIH19XHJcbiAgICAgICAgICB0cmFuc2l0aW9uPXt7XHJcbiAgICAgICAgICAgIGR1cmF0aW9uOiA5LFxyXG4gICAgICAgICAgICByZXBlYXQ6IEluZmluaXR5LFxyXG4gICAgICAgICAgICBlYXNlOiBcImVhc2VJbk91dFwiLFxyXG4gICAgICAgICAgfX1cclxuICAgICAgICAvPlxyXG4gICAgICAgIDxtb3Rpb24uZGl2XHJcbiAgICAgICAgICBjbGFzc05hbWU9XCJhbmltYXRlZC1ncmFkaWVudFwiXHJcbiAgICAgICAgICBhbmltYXRlPXt7XHJcbiAgICAgICAgICAgIGJhY2tncm91bmRQb3NpdGlvbjogW1wiMCUgNTAlXCIsIFwiMTAwJSA1MCVcIiwgXCIwJSA1MCVcIl0sXHJcbiAgICAgICAgICB9fVxyXG4gICAgICAgICAgdHJhbnNpdGlvbj17e1xyXG4gICAgICAgICAgICBkdXJhdGlvbjogNixcclxuICAgICAgICAgICAgcmVwZWF0OiBJbmZpbml0eSxcclxuICAgICAgICAgICAgZWFzZTogXCJlYXNlSW5PdXRcIixcclxuICAgICAgICAgIH19XHJcbiAgICAgICAgLz5cclxuICAgICAgPC9kaXY+XHJcblxyXG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cImF1dGgtc2hlbGxfX292ZXJsYXlcIiAvPlxyXG5cclxuICAgICAgPG1vdGlvbi5zZWN0aW9uXHJcbiAgICAgICAgY2xhc3NOYW1lPVwiYXV0aC1jYXJkXCJcclxuICAgICAgICBpbml0aWFsPXt7IG9wYWNpdHk6IDAsIHk6IDIwIH19XHJcbiAgICAgICAgYW5pbWF0ZT17eyBvcGFjaXR5OiAxLCB5OiAwIH19XHJcbiAgICAgICAgdHJhbnNpdGlvbj17eyBkdXJhdGlvbjogMC42LCBlYXNlOiBcImVhc2VPdXRcIiB9fVxyXG4gICAgICA+XHJcbiAgICAgICAgPG1vdGlvbi5kaXZcclxuICAgICAgICAgIGNsYXNzTmFtZT1cImF1dGgtYnJhbmRcIlxyXG4gICAgICAgICAgaW5pdGlhbD17eyBvcGFjaXR5OiAwLCBzY2FsZTogMC45IH19XHJcbiAgICAgICAgICBhbmltYXRlPXt7IG9wYWNpdHk6IDEsIHNjYWxlOiAxIH19XHJcbiAgICAgICAgICB0cmFuc2l0aW9uPXt7IGR1cmF0aW9uOiAwLjUsIGRlbGF5OiAwLjIgfX1cclxuICAgICAgICA+XHJcbiAgICAgICAgICA8bW90aW9uLmRpdlxyXG4gICAgICAgICAgICBjbGFzc05hbWU9XCJhdXRoLWJyYW5kX19tYXJrXCJcclxuICAgICAgICAgID5cclxuICAgICAgICAgICAgPGltZyBzcmM9e2xvZ29NYXJrfSBhbHQ9XCJUZWFtIFBhY2lmaWMgQ29ycG9yYXRpb25cIiAvPlxyXG4gICAgICAgICAgPC9tb3Rpb24uZGl2PlxyXG4gICAgICAgICAgPG1vdGlvbi5oMVxyXG4gICAgICAgICAgICBpbml0aWFsPXt7IG9wYWNpdHk6IDAgfX1cclxuICAgICAgICAgICAgYW5pbWF0ZT17eyBvcGFjaXR5OiAxIH19XHJcbiAgICAgICAgICAgIHRyYW5zaXRpb249e3sgZHVyYXRpb246IDAuNSwgZGVsYXk6IDAuNCB9fVxyXG4gICAgICAgICAgPlxyXG4gICAgICAgICAgICBJQyBERVRFQ1RJT05cclxuICAgICAgICAgIDwvbW90aW9uLmgxPlxyXG4gICAgICAgIDwvbW90aW9uLmRpdj5cclxuXHJcbiAgICAgICAgPG1vdGlvbi5kaXZcclxuICAgICAgICAgIGNsYXNzTmFtZT1cImF1dGgtY2FyZF9fdGl0bGVcIlxyXG4gICAgICAgICAgaW5pdGlhbD17eyBvcGFjaXR5OiAwIH19XHJcbiAgICAgICAgICBhbmltYXRlPXt7IG9wYWNpdHk6IDEgfX1cclxuICAgICAgICAgIHRyYW5zaXRpb249e3sgZHVyYXRpb246IDAuNSwgZGVsYXk6IDAuMyB9fVxyXG4gICAgICAgID5cclxuICAgICAgICAgIDxoMj5Mb2dpbjwvaDI+XHJcbiAgICAgICAgPC9tb3Rpb24uZGl2PlxyXG5cclxuICAgICAgICB7YXBpTWVzc2FnZSA/IChcclxuICAgICAgICAgIDxtb3Rpb24uZGl2XHJcbiAgICAgICAgICAgIGNsYXNzTmFtZT1cIm5vdGljZSBub3RpY2UtLWluZm9cIlxyXG4gICAgICAgICAgICBpbml0aWFsPXt7IG9wYWNpdHk6IDAsIHk6IC02IH19XHJcbiAgICAgICAgICAgIGFuaW1hdGU9e3sgb3BhY2l0eTogMSwgeTogMCB9fVxyXG4gICAgICAgICAgICB0cmFuc2l0aW9uPXt7IGR1cmF0aW9uOiAwLjMsIGRlbGF5OiAwLjMgfX1cclxuICAgICAgICAgICAgYXJpYS1saXZlPVwicG9saXRlXCJcclxuICAgICAgICAgID5cclxuICAgICAgICAgICAge2FwaU1lc3NhZ2V9XHJcbiAgICAgICAgICA8L21vdGlvbi5kaXY+XHJcbiAgICAgICAgKSA6IG51bGx9XHJcblxyXG4gICAgICAgIDxtb3Rpb24uZm9ybVxyXG4gICAgICAgICAgY2xhc3NOYW1lPVwiYXV0aC1mb3JtXCJcclxuICAgICAgICAgIG9uU3VibWl0PXtoYW5kbGVTdWJtaXR9XHJcbiAgICAgICAgICBpbml0aWFsPXt7IG9wYWNpdHk6IDAgfX1cclxuICAgICAgICAgIGFuaW1hdGU9e3sgb3BhY2l0eTogMSB9fVxyXG4gICAgICAgICAgdHJhbnNpdGlvbj17eyBkdXJhdGlvbjogMC41LCBkZWxheTogMC40IH19XHJcbiAgICAgICAgPlxyXG4gICAgICAgICAgPG1vdGlvbi5sYWJlbFxyXG4gICAgICAgICAgICBjbGFzc05hbWU9XCJmaWVsZCBmaWVsZC0tbG9naW5cIlxyXG4gICAgICAgICAgICBpbml0aWFsPXt7IG9wYWNpdHk6IDAsIHg6IC0yMCB9fVxyXG4gICAgICAgICAgICBhbmltYXRlPXt7IG9wYWNpdHk6IDEsIHg6IDAgfX1cclxuICAgICAgICAgICAgdHJhbnNpdGlvbj17eyBkdXJhdGlvbjogMC40LCBkZWxheTogMC40NSB9fVxyXG4gICAgICAgICAgPlxyXG4gICAgICAgICAgICA8c3Bhbj5Vc2VybmFtZTwvc3Bhbj5cclxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmaWVsZC1jb250cm9sXCI+XHJcbiAgICAgICAgICAgICAgPGlucHV0XHJcbiAgICAgICAgICAgICAgICBjbGFzc05hbWU9XCJhdXRoLWZvcm1fX2lucHV0XCJcclxuICAgICAgICAgICAgICAgIHZhbHVlPXt1c2VybmFtZX1cclxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsoZXZlbnQpID0+IHNldFVzZXJuYW1lKGV2ZW50LnRhcmdldC52YWx1ZSl9XHJcbiAgICAgICAgICAgICAgICB0eXBlPVwidGV4dFwiXHJcbiAgICAgICAgICAgICAgICBhdXRvQ29tcGxldGU9XCJ1c2VybmFtZVwiXHJcbiAgICAgICAgICAgICAgICBwbGFjZWhvbGRlcj1cIkVudGVyIHlvdXIgdXNlcm5hbWVcIlxyXG4gICAgICAgICAgICAgIC8+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgPC9tb3Rpb24ubGFiZWw+XHJcblxyXG4gICAgICAgICAgPG1vdGlvbi5sYWJlbFxyXG4gICAgICAgICAgICBjbGFzc05hbWU9XCJmaWVsZCBmaWVsZC0tbG9naW5cIlxyXG4gICAgICAgICAgICBpbml0aWFsPXt7IG9wYWNpdHk6IDAsIHg6IC0yMCB9fVxyXG4gICAgICAgICAgICBhbmltYXRlPXt7IG9wYWNpdHk6IDEsIHg6IDAgfX1cclxuICAgICAgICAgICAgdHJhbnNpdGlvbj17eyBkdXJhdGlvbjogMC40LCBkZWxheTogMC41IH19XHJcbiAgICAgICAgICA+XHJcbiAgICAgICAgICAgIDxzcGFuPlBhc3N3b3JkPC9zcGFuPlxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZpZWxkLWNvbnRyb2xcIj5cclxuICAgICAgICAgICAgICA8aW5wdXRcclxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZT1cImF1dGgtZm9ybV9faW5wdXRcIlxyXG4gICAgICAgICAgICAgICAgdmFsdWU9e3Bhc3N3b3JkfVxyXG4gICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhldmVudCkgPT4gc2V0UGFzc3dvcmQoZXZlbnQudGFyZ2V0LnZhbHVlKX1cclxuICAgICAgICAgICAgICAgIHR5cGU9XCJwYXNzd29yZFwiXHJcbiAgICAgICAgICAgICAgICBhdXRvQ29tcGxldGU9XCJjdXJyZW50LXBhc3N3b3JkXCJcclxuICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyPVwiRW50ZXIgeW91ciBwYXNzd29yZFwiXHJcbiAgICAgICAgICAgICAgLz5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICA8L21vdGlvbi5sYWJlbD5cclxuXHJcbiAgICAgICAgICB7ZXJyb3JNZXNzYWdlID8gKFxyXG4gICAgICAgICAgICA8bW90aW9uLmRpdlxyXG4gICAgICAgICAgICAgIGNsYXNzTmFtZT1cIm5vdGljZSBub3RpY2UtLWVycm9yXCJcclxuICAgICAgICAgICAgICBpbml0aWFsPXt7IG9wYWNpdHk6IDAsIHk6IC0xMCB9fVxyXG4gICAgICAgICAgICAgIGFuaW1hdGU9e3sgb3BhY2l0eTogMSwgeTogMCB9fVxyXG4gICAgICAgICAgICAgIHRyYW5zaXRpb249e3sgZHVyYXRpb246IDAuMyB9fVxyXG4gICAgICAgICAgICA+XHJcbiAgICAgICAgICAgICAge2Vycm9yTWVzc2FnZX1cclxuICAgICAgICAgICAgPC9tb3Rpb24uZGl2PlxyXG4gICAgICAgICAgKSA6IG51bGx9XHJcblxyXG4gICAgICAgICAgPG1vdGlvbi5idXR0b25cclxuICAgICAgICAgICAgY2xhc3NOYW1lPVwicHJpbWFyeS1idXR0b24gcHJpbWFyeS1idXR0b24tLWxvZ2luXCJcclxuICAgICAgICAgICAgdHlwZT1cInN1Ym1pdFwiXHJcbiAgICAgICAgICAgIGRpc2FibGVkPXtpc1N1Ym1pdHRpbmd9XHJcbiAgICAgICAgICAgIHdoaWxlSG92ZXI9e3sgc2NhbGU6IDEuMDIgfX1cclxuICAgICAgICAgICAgd2hpbGVUYXA9e3sgc2NhbGU6IDAuOTggfX1cclxuICAgICAgICAgICAgaW5pdGlhbD17eyBvcGFjaXR5OiAwLCB5OiAxMCB9fVxyXG4gICAgICAgICAgICBhbmltYXRlPXt7IG9wYWNpdHk6IDEsIHk6IDAgfX1cclxuICAgICAgICAgICAgdHJhbnNpdGlvbj17eyBkdXJhdGlvbjogMC40LCBkZWxheTogMC41NSB9fVxyXG4gICAgICAgICAgPlxyXG4gICAgICAgICAgICB7aXNTdWJtaXR0aW5nID8gXCJTaWduaW5nIGluLi4uXCIgOiBcIkxvZ2luXCJ9XHJcbiAgICAgICAgICA8L21vdGlvbi5idXR0b24+XHJcbiAgICAgICAgPC9tb3Rpb24uZm9ybT5cclxuICAgICAgPC9tb3Rpb24uc2VjdGlvbj5cclxuICAgIDwvZGl2PlxyXG4gICk7XHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IExvZ2luO1xyXG4iXX0=
