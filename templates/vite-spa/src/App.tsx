import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="app">
      <h1>Vite + React</h1>
      <p>Edit <code>src/App.tsx</code> and save to start building your app.</p>
      <button onClick={() => setCount((c) => c + 1)}>count is {count}</button>
    </main>
  );
}
