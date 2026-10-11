const K = "bpt.theme"; // dark default for trading
export const getTheme = () => (localStorage.getItem(K) === "light" ? "light" : "dark");
export const applyTheme = (t = getTheme()) => { document.documentElement.classList.toggle("dark", t === "dark"); document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#08080a" : "#ffffff"); };
export const toggleTheme = () => { const t = getTheme() === "dark" ? "light" : "dark"; localStorage.setItem(K, t); applyTheme(t); return t; };
