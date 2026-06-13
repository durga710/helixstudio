import { useState } from "react";
import "./App.css";

function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="app">
      <h1>Vite + React</h1>
      <p>
        Edit <code>src/App.tsx</code> and save to test HMR. Add components, state, and styling to build your app.
      </p>
      <button type="button" className="counter" onClick={() => setCount((c) => c + 1)}>
        count is {count}
      </button>
    </main>
  );
}

export default App;
