/** @type {import('tailwindcss').Config} */
export default {
  // 深色模式用 class 策略:在 <html> 加 .dark 即切換(由 ThemeContext 控制)。
  darkMode: "class",
  // content:告訴 Tailwind 去哪些檔案掃描 class 名稱,只產生用到的樣式。
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // 自訂斷點概念說明(沿用 Tailwind 預設即可):
      //   sm 640px / md 768px / lg 1024px / xl 1280px
      //   手機:預設(<640)  平板:md  筆電:lg 以上
      // 長輩友善基準:在 index.css 把 body 字級設大,按鈕點擊區 >= 48px。
      colors: {
        brand: {
          DEFAULT: "#1d4ed8", // 主色(藍)
          dark: "#1e3a8a",
        },
      },
    },
  },
  plugins: [],
};
