// Data layer. In-memory store standing in for a database — swap for your ORM
// (Prisma, Sequelize, Mongoose). Controllers only talk to this module.
const items = [
  { id: 1, name: "First item" },
  { id: 2, name: "Second item" },
];

export function all() {
  return items;
}

export function create(name) {
  const item = { id: items.length ? items[items.length - 1].id + 1 : 1, name };
  items.push(item);
  return item;
}
