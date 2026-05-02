type Post = { id: number; title: string; body: string };

async function getPosts(): Promise<Post[]> {
  const r = await fetch("https://jsonplaceholder.typicode.com/posts?_limit=5", {
    cache: "no-store",
  });
  return r.json();
}

async function postEcho() {
  const r = await fetch("https://jsonplaceholder.typicode.com/posts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "hello", body: "from ssr", userId: 1 }),
    cache: "no-store",
  });
  return r.json();
}

export default async function Posts() {
  const [posts, echo] = await Promise.all([getPosts(), postEcho()]);
  return (
    <main>
      <h1>Posts</h1>
      <p>This page makes two parallel SSR fetches (GET + POST).</p>
      <h2>POST echo response</h2>
      <pre style={{ background: "#f5f5f5", padding: 8 }}>
        {JSON.stringify(echo, null, 2)}
      </pre>
      <h2>Posts</h2>
      <ul>
        {posts.map((p) => (
          <li key={p.id}>
            <strong>{p.title}</strong>
            <div style={{ color: "#555" }}>{p.body}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
