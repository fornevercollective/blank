/**
 * Regenerate support/artists-major.json — run: node support/scripts/build-artists-major.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inferRegion } from "../live-concerts-regions.mjs";
import { letterForName } from "../live-concerts-alphabets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "artists-major.json");
const warpedPath = path.join(__dirname, "..", "warped-tour-lineups.json");

/** @returns {Map<string, { name: string, totalYears: number, years: number[] }>} */
function loadWarpedBands() {
  if (!fs.existsSync(warpedPath)) return new Map();
  const data = JSON.parse(fs.readFileSync(warpedPath, "utf8"));
  const map = new Map();
  for (const b of data.bands || []) {
    if (b?.name) map.set(String(b.name).toLowerCase(), b);
  }
  return map;
}

/** @type {string[]} */
const NAMES = [
  "ABBA", "AC/DC", "Adele", "Aerosmith", "Alicia Keys", "Amy Winehouse", "Andrea Bocelli",
  "Aphex Twin", "Arcade Fire", "Ariana Grande", "Arctic Monkeys", "Avicii", "Bad Bunny",
  "The Beach Boys", "The Beatles", "Beck", "Beyoncé", "Billie Eilish", "Björk", "Blur",
  "Bob Dylan", "Bob Marley", "Bon Iver", "Bon Jovi", "Brandi Carlile", "Bruno Mars", "BTS",
  "Burna Boy", "Calvin Harris", "Cardi B", "Celine Dion", "Chance the Rapper", "Charli XCX",
  "Chris Stapleton", "The Chainsmokers", "Childish Gambino", "The Clash", "Coldplay",
  "DaBaby", "Daft Punk", "David Bowie", "Deadmau5", "Depeche Mode", "Doja Cat", "Dolly Parton",
  "Drake", "Dua Lipa", "Duke Ellington", "Eagles", "Ed Sheeran", "Ellie Goulding", "Eminem",
  "Elton John", "Eric Clapton", "Eurythmics", "Fleetwood Mac", "Florence and the Machine",
  "Foo Fighters", "Frank Ocean", "Frank Sinatra", "Future", "George Michael", "Gorillaz",
  "Green Day", "Guns N' Roses", "Halsey", "Harry Styles", "Herbie Hancock", "Hozier",
  "Imagine Dragons", "Iron Maiden", "Jack Harlow", "Janet Jackson", "Jay-Z", "Janelle Monáe",
  "Jimi Hendrix", "John Legend", "John Mayer", "Jonas Brothers", "Juice WRLD", "Justin Bieber",
  "Kacey Musgraves", "Kanye West", "Katy Perry", "Kehlani", "Khalid", "Kid Cudi",
  "Kings of Leon", "KISS", "Kendrick Lamar", "Lady Gaga", "Lana Del Rey", "Led Zeppelin",
  "Lil Nas X", "Lil Wayne", "Linkin Park", "Lizzo", "Lorde", "Luke Combs", "Mac Miller",
  "Madonna", "Megan Thee Stallion", "Metallica", "Michael Jackson", "Migos", "Miles Davis",
  "Miley Cyrus", "Mitski", "Morgan Wallen", "Muse", "Nas", "The National", "Nicki Minaj",
  "Nine Inch Nails", "Nirvana", "No Doubt", "Oasis", "Olivia Rodrigo", "OneRepublic", "OutKast",
  "Panic! at the Disco", "Pearl Jam", "Phoenix", "Pink", "Pink Floyd", "Playboi Carti",
  "Post Malone", "Prince", "Queen", "Queens of the Stone Age", "Radiohead",
  "Rage Against the Machine", "Red Hot Chili Peppers", "R.E.M.", "Rihanna",
  "The Rolling Stones", "Rosalía", "Sabrina Carpenter", "Sam Smith", "Shakira", "Sia",
  "Simon & Garfunkel", "Stevie Wonder", "The Strokes", "SZA", "Tame Impala", "Taylor Swift",
  "The 1975", "The Killers", "The Weeknd", "Tiësto", "Travis Scott", "Twenty One Pilots",
  "Tyler, the Creator", "U2", "Usher", "Vampire Weekend", "Van Halen", "Whitney Houston",
  "The Who", "Wu-Tang Clan", "XXXTentacion", "Ye", "Young Thug", "Yungblud", "Zach Bryan",
  "Zara Larsson", "Zedd", "Zayn", "André 3000", "Aretha Franklin", "Barry White",
  "Beastie Boys", "Black Sabbath", "Black Eyed Peas", "Blondie", "Boston", "Boyz II Men",
  "Bruce Springsteen", "Buddy Holly", "Cat Stevens", "Cher", "Chicago", "Chaka Khan",
  "Chris Brown", "Christina Aguilera", "Chuck Berry", "Common", "Culture Club", "Cyndi Lauper",
  "Diana Ross", "Dire Straits", "The Doors", "Don Henley", "Earth, Wind & Fire", "Elvis Presley",
  "Enya", "Faith Hill", "Fats Domino", "Fela Kuti", "The Flaming Lips", "Fleet Foxes",
  "Four Tops", "Frank Zappa", "Franz Ferdinand", "Freddie Mercury", "George Harrison",
  "Gloria Estefan", "Grateful Dead", "Hall & Oates", "Hank Williams", "Heart", "Iggy Pop",
  "INXS", "Isley Brothers", "Jackson 5", "James Brown", "James Taylor", "Jamiroquai",
  "Janis Joplin", "Jason Aldean", "Jefferson Airplane", "Jerry Garcia", "Jewel", "Jill Scott",
  "Jimmy Buffett", "Joan Baez", "Joe Cocker", "John Denver", "Johnny Cash", "Joni Mitchell",
  "Journey", "Judas Priest", "Julio Iglesias", "Kansas", "Kate Bush", "Kenny Chesney",
  "Kenny Rogers", "Kid Rock", "King Crimson", "Kool & the Gang", "Kraftwerk", "KRS-One",
  "Lauryn Hill", "LeAnn Rimes", "Leonard Cohen", "Lionel Richie", "Little Richard",
  "LL Cool J", "Los Lobos", "Lou Reed", "Louis Armstrong", "Luther Vandross", "Lynyrd Skynyrd",
  "Mariah Carey", "Marvin Gaye", "Mary J. Blige", "Massive Attack", "Megadeth", "Merle Haggard",
  "MGMT", "Michael Bublé", "Modest Mouse", "Morrissey", "Mötley Crüe", "Mumford & Sons",
  "My Chemical Romance", "Nat King Cole", "Neil Diamond", "Neil Young", "New Order",
  "Nina Simone", "Norah Jones", "The Notorious B.I.G.", "OK Go", "One Direction",
  "Patti Smith", "Paul McCartney", "Paul Simon", "Peggy Lee", "Pentatonix", "Pet Shop Boys",
  "Peter Gabriel", "Phil Collins", "Phish", "PJ Harvey", "Placebo", "The Police",
  "Public Enemy", "Puff Daddy", "Quincy Jones", "Randy Travis", "Ray Charles", "Reba McEntire",
  "Ricky Martin", "Rod Stewart", "Roger Waters", "Roy Orbison", "Rush", "Sam Cooke",
  "Santana", "Sarah McLachlan", "Scorpions", "Selena", "Sex Pistols", "Sheryl Crow",
  "Smashing Pumpkins", "Smokey Robinson", "Snoop Dogg", "Snow Patrol", "Soundgarden",
  "Spice Girls", "Sting", "Stone Temple Pilots", "Stray Cats", "Styx", "Supertramp",
  "The Supremes", "System of a Down", "Talking Heads", "Tears for Fears", "The Temptations",
  "Thin Lizzy", "Tina Turner", "TLC", "Toby Keith", "Tom Jones", "Tom Petty", "Tom Waits",
  "Toni Braxton", "Tony Bennett", "Tool", "Tori Amos", "Tower of Power", "Tracy Chapman",
  "Train", "Tupac Shakur", "Van Morrison", "The Velvet Underground", "Village People",
  "Violent Femmes", "War", "Willie Nelson", "Wilson Pickett", "Wings", "Wyclef Jean",
  "Yes", "ZZ Top", "A Tribe Called Quest", "Air Supply", "Alabama Shakes", "Alice Cooper",
  "Allman Brothers Band", "Alt-J", "America", "Anthrax", "August Burns Red", "B.B. King",
  "Backstreet Boys", "Barbra Streisand", "Basement Jaxx", "Bee Gees", "Ben Folds",
  "Benny Goodman", "Billy Idol", "Billy Joel", "Blue Öyster Cult", "Bo Diddley",
  "Breaking Benjamin", "Bring Me the Horizon", "Britney Spears", "Bryan Adams", "Buddy Guy",
  "Cage the Elephant", "Camila Cabello", "Carly Rae Jepsen", "Carole King", "Carpenters",
  "Chance the Rapper", "Chevelle", "Christina Perri", "Coheed and Cambria", "Counting Crows",
  "Creedence Clearwater Revival", "Crowded House", "Crystal Castles", "Cypress Hill",
  "Dashboard Confessional", "Dave Matthews Band", "Death Cab for Cutie", "Deep Purple",
  "Def Leppard", "Deftones", "Destiny's Child", "Diplo", "Dixie Chicks", "DMX",
  "Dropkick Murphys", "Duran Duran", "Electric Light Orchestra", "Ella Fitzgerald",
  "Emeli Sandé", "En Vogue", "Eric Church", "Evanescence", "Everclear", "Faith No More",
  "Fall Out Boy", "Fatboy Slim", "Fitz and the Tantrums", "Florence + The Machine",
  "Flyleaf", "Foreigner", "Foster the People", "Fountains of Wayne", "Frank Turner",
  "Fugees", "Garbage", "Genesis", "Ghost", "Gin Blossoms", "Goo Goo Dolls", "Greta Van Fleet",
  "Guns N' Roses", "Haim", "Hanson", "Heart", "Hoobastank", "Hootie & the Blowfish",
  "Huey Lewis and the News", "Hüsker Dü", "Ice Cube", "Incubus", "Interpol", "Iron & Wine",
  "Jack White", "James Bay", "James Blake", "Janelle Monáe", "Jason Mraz", "Jeff Buckley",
  "Jennifer Lopez", "Jeremih", "Jessie J", "Jethro Tull", "Jimmy Eat World", "Joan Jett",
  "Joe Bonamassa", "John Fogerty", "John Mellencamp", "Jordin Sparks", "Joy Division",
  "Judas Priest", "Juvenile", "Kaleo", "Kansas", "Kate Bush", "Keane", "Keith Urban",
  "Kelly Clarkson", "Kesha", "Khruangbin", "Kings of Convenience", "Korn", "Kygo",
  "Lana Del Rey", "LCD Soundsystem", "Le Tigre", "Limp Bizkit", "Linda Ronstadt",
  "Lionel Richie", "Logic", "Los Lonely Boys", "Ludacris", "Lynyrd Skynyrd", "M.I.A.",
  "Machine Gun Kelly", "Macy Gray", "Manic Street Preachers", "Mariah Carey", "Maroon 5",
  "Martina McBride", "Matchbox Twenty", "Maxwell", "Meat Loaf", "Megadeth", "Melanie Martinez",
  "Metallica", "Method Man", "MGMT", "Michelle Branch", "Migos", "Miranda Lambert",
  "Missy Elliott", "Moby", "Monica", "Mötley Crüe", "Motörhead", "Mumford & Sons",
  "Muse", "My Morning Jacket", "Nas", "Natasha Bedingfield", "Ne-Yo", "Neutral Milk Hotel",
  "New Kids on the Block", "Nick Cave and the Bad Seeds", "Nico", "Nightwish", "Nina Kraviz",
  "Noah Kahan", "Norah Jones", "O.A.R.", "Ocean Alley", "Of Monsters and Men", "Old Dominion",
  "Olivia Newton-John", "OMC", "One OK Rock", "Opeth", "Orbital", "Os Mutantes", "Otis Redding",
  "Ozzy Osbourne", "P.O.D.", "Panic! at the Disco", "Paramore", "Parliament-Funkadelic",
  "Passenger", "Pat Benatar", "Patti LaBelle", "Paula Abdul", "Pavement", "Pearl Jam",
  "Pentatonix", "Peter Frampton", "Pharrell Williams", "Pierce the Veil", "Pitbull",
  "Pixies", "Poco", "Portishead", "Preservation Hall Jazz Band", "Primus", "Prince",
  "Puddle of Mudd", "Puscifer", "Queensrÿche", "Rammstein", "Ray LaMontagne", "Rebelution",
  "Regina Spektor", "REM", "Rihanna", "Rise Against", "Rob Zombie", "Robert Palmer",
  "Robin Thicke", "Rodgers and Hammerstein", "Roger Miller", "Roxette", "Royksopp",
  "Rufus Wainwright", "Run-D.M.C.", "Rush", "Sabaton", "Sam Hunt", "Sammy Hagar",
  "Santigold", "Sarah Bareilles", "Scissor Sisters", "Seether", "Selena Gomez",
  "Sepultura", "Shaggy", "Shania Twain", "Shawn Mendes", "Sheryl Crow", "Shinedown",
  "Sigur Rós", "Silversun Pickups", "Simple Minds", "Sister Hazel", "Skillet", "Skrillex",
  "Slayer", "Slipknot", "Smash Mouth", "Social Distortion", "Solange", "Son Volt",
  "Soul Asylum", "Spoon", "Staind", "Static X", "Steely Dan", "Steppenwolf", "Steve Earle",
  "Steve Winwood", "Stevie Ray Vaughan", "Stone Sour", "Stray Cats", "Sturgill Simpson",
  "Sublime", "Sum 41", "Switchfoot", "T-Pain", "Tame Impala", "Tegan and Sara", "Temple of the Dog",
  "Tesla", "The All-American Rejects", "The Band", "The Black Keys", "The Cranberries",
  "The Damned", "The Decemberists", "The Doobie Brothers", "The Fray", "The Gaslight Anthem",
  "The Goo Goo Dolls", "The Head and the Heart", "The Human League", "The Jam",
  "The Jesus and Mary Chain", "The Kinks", "The Lumineers", "The Mamas & the Papas",
  "The Mars Volta", "The Monkees", "The Offspring", "The Pointer Sisters", "The Pretenders",
  "The Prodigy", "The Psychedelic Furs", "The Raconteurs", "The Ramones", "The Replacements",
  "The Script", "The Shins", "The Smashing Pumpkins", "The Specials", "The Stone Roses",
  "The Stranglers", "The Sundays", "The Ting Tings", "The Verve", "The War on Drugs",
  "The White Stripes", "The xx", "Third Eye Blind", "Thirty Seconds to Mars", "Three Days Grace",
  "Tiesto", "Timbaland", "Tinashe", "TobyMac", "Tokio Hotel", "Tom Morello", "Toto",
  "Trapt", "Trivium", "Troye Sivan", "Turnstile", "Two Door Cinema Club", "Tycho",
  "UB40", "Underworld", "Vanessa Carlton", "Vince Gill", "Violent Femmes", "Wale",
  "Walk the Moon", "Weezer", "Wet Leg", "Wham!", "White Stripes", "Wilco", "Will Young",
  "Within Temptation", "Wiz Khalifa", "Wolf Alice", "Wolfgang Amadeus Mozart", "X Ambassadors",
  "Xzibit", "Yeah Yeah Yeahs", "Yellowcard", "Yola", "Young the Giant", "Yusuf / Cat Stevens",
  "Zac Brown Band", "Zapp & Roger", "Zucchero",
  "Ария", "Би-2", "Кино", "Мумий Тролль", "Земфира", "Любэ", "t.A.T.u.",
  "Манго Манго", "Полина Гагарина", "Сектор Газа", "Сплин", "ДДТ",
  "Μάνος Χατζιδάκις", "Nana Mouskouri", "Vangelis",
  "فيروز", "Amr Diab", "Umm Kulthum", "Mohammed Abdu",
  "עפרה חזה", "Shalom Hanoch",
  "방탄소년단", "BLACKPINK", "IU", "BIGBANG", "SEVENTEEN", "NewJeans",
  "宇多田ヒカル", "米津玄師", "YOASOBI", "あいみょん", "椎名林檎",
  "嵐", "AKB48", "ONE OK ROCK",
  "邓丽君", "周杰伦", "王菲", "邓紫棋", "五月天",
  "लता मंगेशकर", "A. R. Rahman", "Kishore Kumar",
  "ไมค์ ภิรมพร", "Carabao", "Bird Thongchai",
];

const warpedByName = loadWarpedBands();
const nameSet = new Set(NAMES.map((n) => n.trim()).filter(Boolean));
for (const b of warpedByName.values()) {
  if (b.name) nameSet.add(b.name);
}

const uniq = [...nameSet].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));

const artists = uniq.map((name) => {
  const { letter, script } = letterForName(name);
  const warped = warpedByName.get(name.toLowerCase());
  const row = { name, letter, script, region: inferRegion(name) };
  if (warped) {
    row.warped = {
      totalYears: warped.totalYears,
      years: warped.years,
    };
  }
  return row;
});

const payload = {
  version: 5,
  count: artists.length,
  warpedSource: warpedByName.size
    ? "https://en.wikipedia.org/wiki/List_of_Warped_Tour_lineups_by_year"
    : undefined,
  artists,
};
fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${artists.length} artists to ${outPath}`);
