/**
 * Small, bundled text corpora for the Lab's language-model widget (langModel).
 * Short, kid-friendly, and repetitive on purpose — repetition is what lets a
 * tiny next-word model produce coherent text, so students see it "work" fast.
 * Mirrors datasets.ts in spirit. Original / nursery-rhyme-style text only.
 */

export interface Corpus {
  id: string;
  name: string;
  /** A sensible default prompt for this corpus (a context the model has seen). */
  seed: string;
  text: string;
}

const NURSERY: Corpus = {
  id: "rhymes",
  name: "Nursery rhymes",
  seed: "the cat",
  text: `the cat sat on the mat. the cat sat on the hat. the dog sat on the log.
twinkle twinkle little star. how i wonder what you are. up above the world so high.
like a diamond in the sky. twinkle twinkle little star.
jack and jill went up the hill to fetch a pail of water. jack fell down and broke his crown and jill came tumbling after.
the itsy bitsy spider went up the water spout. down came the rain and washed the spider out.
out came the sun and dried up all the rain. and the itsy bitsy spider went up the spout again.
humpty dumpty sat on a wall. humpty dumpty had a great fall.
all the kings horses and all the kings men could not put humpty together again.
hickory dickory dock. the mouse ran up the clock. the clock struck one. the mouse ran down. hickory dickory dock.`,
};

const FABLES: Corpus = {
  id: "fables",
  name: "Tiny fables",
  seed: "the fox",
  text: `the fox saw the grapes high on the vine. the fox jumped for the grapes but could not reach.
the fox said the grapes are sour and walked away. the grapes were sweet but the fox would not try again.
the slow tortoise raced the fast hare. the hare ran ahead and stopped to rest.
the tortoise kept going slow and steady. the tortoise passed the sleeping hare and won the race.
slow and steady wins the race. the hare was fast but the tortoise was wise.
the ant worked all summer to store food. the grasshopper played all summer and sang songs.
when winter came the ant had food and the grasshopper had none. work today and you will eat tomorrow.
the lion was caught in a net. a little mouse came and chewed the net. even a little friend can be a big help.`,
};

const JOKES: Corpus = {
  id: "jokes",
  name: "Knock-knock jokes",
  seed: "knock knock",
  text: `knock knock. who is there? boo. boo who? do not cry it is just a joke.
knock knock. who is there? lettuce. lettuce who? lettuce in it is cold outside.
knock knock. who is there? cow says. cow says who? no a cow says moo.
knock knock. who is there? orange. orange who? orange you glad i said knock knock.
knock knock. who is there? banana. banana who? knock knock. who is there? banana. banana who?
knock knock. who is there? orange. orange who? orange you glad i did not say banana.
why did the chicken cross the road? to get to the other side.
why was the math book sad? because it had too many problems.`,
};

const SPACE: Corpus = {
  id: "space",
  name: "Space facts",
  seed: "the sun",
  text: `the sun is a star. the sun is very hot. the sun gives us light and heat.
the earth goes around the sun. the moon goes around the earth. the earth is our home.
mars is the red planet. mars is cold and dusty. people want to visit mars one day.
jupiter is the biggest planet. jupiter is a giant ball of gas. jupiter has many moons.
a rocket flies up into space. a rocket is very loud and very fast. the rocket carries people to space.
stars are like our sun but far away. stars make their own light. there are many many stars in the sky.
the moon has no air. the moon is dusty and grey. astronauts have walked on the moon.`,
};

export const CORPORA: Corpus[] = [NURSERY, FABLES, JOKES, SPACE];

export function getCorpus(id: string): Corpus {
  return CORPORA.find((c) => c.id === id) ?? CORPORA[0];
}
