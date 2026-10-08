const express = require('express');
const db = require('../db');

const router = express.Router();

const FIELD_CATALOG = [
  {
    slug: 'software-engineering',
    name: 'Software Engineering',
    summary: 'Build reliable software, improve code quality, and ship real products.',
  },
  {
    slug: 'web-development',
    name: 'Web Development',
    summary: 'Build modern, accessible, and scalable websites and web applications.',
  },
  {
    slug: 'mobile-development',
    name: 'Mobile Development',
    summary: 'Create Android, iOS, and cross-platform mobile applications.',
  },
  {
    slug: 'frontend-development',
    name: 'Frontend Development',
    summary: 'Build engaging interfaces and responsive experiences for the web.',
  },
  {
    slug: 'backend-development',
    name: 'Backend Development',
    summary: 'Build APIs, services, databases, and reliable server-side systems.',
  },
  {
    slug: 'full-stack-development',
    name: 'Full-Stack Development',
    summary: 'Work across frontend, backend, databases, APIs, and deployment.',
  },
  {
    slug: 'cybersecurity',
    name: 'Cybersecurity',
    summary: 'Protect systems, applications, networks, identities, and data.',
  },
  {
    slug: 'ethical-hacking',
    name: 'Ethical Hacking',
    summary: 'Find vulnerabilities and help organizations build more secure systems.',
  },
  {
    slug: 'cloud-computing',
    name: 'Cloud Computing',
    summary: 'Build and manage modern applications and infrastructure in the cloud.',
  },
  {
    slug: 'cloud-devops',
    name: 'Cloud & DevOps',
    summary: 'Automate development, deployment, infrastructure, and operations.',
  },
  {
    slug: 'data-science',
    name: 'Data Science',
    summary: 'Turn data into insights, predictions, and better decisions.',
  },
  {
    slug: 'data-analytics',
    name: 'Data Analytics',
    summary: 'Analyze data and communicate insights that support better decisions.',
  },
  {
    slug: 'data-engineering',
    name: 'Data Engineering',
    summary: 'Build pipelines and systems that make data reliable and accessible.',
  },
  {
    slug: 'artificial-intelligence',
    name: 'Artificial Intelligence',
    summary: 'Build intelligent systems that solve real-world problems.',
  },
  {
    slug: 'machine-learning',
    name: 'Machine Learning',
    summary: 'Build models that learn from data and improve predictions and decisions.',
  },
  {
    slug: 'generative-ai',
    name: 'Generative AI',
    summary: 'Build applications and workflows powered by modern generative AI.',
  },
  {
    slug: 'blockchain-web3',
    name: 'Blockchain & Web3',
    summary: 'Explore decentralized applications, blockchain systems, and digital assets.',
  },
  {
    slug: 'game-development',
    name: 'Game Development',
    summary: 'Design and build interactive games and immersive experiences.',
  },
  {
    slug: 'embedded-systems',
    name: 'Embedded Systems',
    summary: 'Build software and technology for connected physical devices.',
  },
  {
    slug: 'robotics',
    name: 'Robotics',
    summary: 'Combine software, hardware, automation, and intelligent machines.',
  },
  {
    slug: 'internet-of-things',
    name: 'Internet of Things',
    summary: 'Connect devices, sensors, software, and physical environments.',
  },
  {
    slug: 'product-management',
    name: 'Product Management',
    summary: 'Turn customer problems into useful products and measurable outcomes.',
  },
  {
    slug: 'project-management',
    name: 'Project Management',
    summary: 'Plan, coordinate, and deliver successful projects and initiatives.',
  },
  {
    slug: 'business-analysis',
    name: 'Business Analysis',
    summary: 'Understand business problems and translate them into practical solutions.',
  },
  {
    slug: 'business-entrepreneurship',
    name: 'Business & Entrepreneurship',
    summary: 'Turn ideas into sustainable businesses and new opportunities.',
  },
  {
    slug: 'marketing-growth',
    name: 'Marketing & Growth',
    summary: 'Build audiences, run experiments, and create sustainable growth.',
  },
  {
    slug: 'digital-marketing',
    name: 'Digital Marketing',
    summary: 'Use digital channels to reach customers and grow organizations.',
  },
  {
    slug: 'social-media',
    name: 'Social Media',
    summary: 'Build communities, content strategies, and meaningful online engagement.',
  },
  {
    slug: 'sales-business-development',
    name: 'Sales & Business Development',
    summary: 'Build relationships, understand customers, and create business opportunities.',
  },
  {
    slug: 'finance-accounting',
    name: 'Finance & Accounting',
    summary: 'Manage financial information, planning, reporting, and business performance.',
  },
  {
    slug: 'fintech',
    name: 'FinTech',
    summary: 'Build technology that improves financial services and access.',
  },
  {
    slug: 'investment',
    name: 'Investment & Wealth',
    summary: 'Explore investing, financial markets, portfolio management, and wealth creation.',
  },
  {
    slug: 'human-resources',
    name: 'Human Resources & People',
    summary: 'Build better workplaces and help organizations develop their people.',
  },
  {
    slug: 'community-ops',
    name: 'Community & Operations',
    summary: 'Build reliable systems and improve how teams and communities work.',
  },
  {
    slug: 'operations-management',
    name: 'Operations Management',
    summary: 'Improve processes, systems, efficiency, and organizational performance.',
  },
  {
    slug: 'supply-chain',
    name: 'Supply Chain & Logistics',
    summary: 'Manage products, resources, logistics, and efficient supply networks.',
  },
  {
    slug: 'content-media',
    name: 'Content & Media',
    summary: 'Create useful stories, media, and content that build audiences.',
  },
  {
    slug: 'journalism',
    name: 'Journalism',
    summary: 'Research, investigate, and communicate important stories responsibly.',
  },
  {
    slug: 'photography',
    name: 'Photography',
    summary: 'Develop professional photography skills and visual storytelling.',
  },
  {
    slug: 'film-video',
    name: 'Film & Video',
    summary: 'Create compelling video, film, documentaries, and visual stories.',
  },
  {
    slug: 'animation',
    name: 'Animation',
    summary: 'Create motion, characters, stories, and engaging visual experiences.',
  },
  {
    slug: 'graphic-design',
    name: 'Graphic Design',
    summary: 'Create visual communication for brands, products, and organizations.',
  },
  {
    slug: 'creative-arts-design',
    name: 'Creative Arts & Design',
    summary: 'Explore creative practice across art, design, and visual communication.',
  },
  {
    slug: 'education-training',
    name: 'Education & Training',
    summary: 'Teach, mentor, train, and create meaningful learning experiences.',
  },
  {
    slug: 'research-academia',
    name: 'Research & Academia',
    summary: 'Explore important questions and turn research into useful knowledge.',
  },
  {
    slug: 'healthcare',
    name: 'Healthcare',
    summary: 'Improve healthcare delivery, systems, technology, and patient experiences.',
  },
  {
    slug: 'healthcare-life-sciences',
    name: 'Healthcare & Life Sciences',
    summary: 'Explore healthcare, biotechnology, research, and life sciences.',
  },
  {
    slug: 'biotechnology',
    name: 'Biotechnology',
    summary: 'Apply science and technology to biology, medicine, and industry.',
  },
  {
    slug: 'legal-compliance',
    name: 'Legal & Compliance',
    summary: 'Understand regulations, manage risk, and support responsible organizations.',
  },
  {
    slug: 'architecture',
    name: 'Architecture',
    summary: 'Design buildings, spaces, environments, and sustainable structures.',
  },
  {
    slug: 'civil-engineering',
    name: 'Civil Engineering',
    summary: 'Design and build infrastructure that supports communities.',
  },
  {
    slug: 'mechanical-engineering',
    name: 'Mechanical Engineering',
    summary: 'Design machines, mechanical systems, and physical products.',
  },
  {
    slug: 'electrical-engineering',
    name: 'Electrical Engineering',
    summary: 'Work with electronics, electrical systems, power, and technology.',
  },
  {
    slug: 'electronics',
    name: 'Electronics',
    summary: 'Design and build electronic systems, circuits, and devices.',
  },
  {
    slug: 'engineering-technology',
    name: 'Engineering & Technology',
    summary: 'Solve complex technical problems and build useful technologies.',
  },
  {
    slug: 'agriculture',
    name: 'Agriculture',
    summary: 'Explore modern agriculture, food systems, farming, and agritech.',
  },
  {
    slug: 'agritech',
    name: 'AgriTech',
    summary: 'Use technology and innovation to improve agriculture and food systems.',
  },
  {
    slug: 'environmental-science',
    name: 'Environmental Science',
    summary: 'Solve environmental challenges through science, technology, and innovation.',
  },
  {
    slug: 'sustainability',
    name: 'Sustainability',
    summary: 'Build solutions that support people, business, and the environment.',
  },
  {
    slug: 'energy',
    name: 'Energy & Renewable Energy',
    summary: 'Explore energy systems, clean technology, and renewable solutions.',
  },
  {
    slug: 'real-estate',
    name: 'Real Estate',
    summary: 'Explore property, real estate development, investment, and management.',
  },
  {
    slug: 'hospitality-tourism',
    name: 'Hospitality & Tourism',
    summary: 'Create better experiences across hospitality, travel, and tourism.',
  },
  {
    slug: 'fashion',
    name: 'Fashion & Apparel',
    summary: 'Explore fashion design, clothing, brands, production, and retail.',
  },
  {
    slug: 'food-beverage',
    name: 'Food & Beverage',
    summary: 'Build businesses and careers across food, restaurants, and beverages.',
  },
  {
    slug: 'public-sector',
    name: 'Public Sector',
    summary: 'Improve public services, policy, government systems, and communities.',
  },
  {
    slug: 'nonprofit-social-impact',
    name: 'Nonprofit & Social Impact',
    summary: 'Build initiatives that create meaningful social and community impact.',
  },
  {
    slug: 'professional-services',
    name: 'Professional Services',
    summary: 'Develop expertise and deliver valuable services to organizations and clients.',
  },
  {
    slug: 'product-design-ux',
    name: 'Product Design & UX',
    summary:
      'Design better experiences, sharpen your case studies, and build a portfolio that reads like real thinking.',
  },
  
  {
    slug: 'marketing-growth',
    name: 'Marketing & Growth',
    summary:
      'Build traction, run experiments, and connect storytelling to clear customer outcomes.',
  },
  {
    slug: 'community-ops',
    name: 'Community & Ops',
    summary:
      'Keep teams grounded, create reliable systems, and improve the experience around the work itself.',
  },
];

router.get('/', async (req, res, next) => {
  try {
    /*
     * Current field theme
     */
    const {
      data: theme,
      error: themeError,
    } = await db
      .from('field_theme')
      .select('*')
      .eq('id', 'current')
      .maybeSingle();

    if (themeError) {
      throw themeError;
    }

    /*
     * Digest items + author names
     *
     * Fetch the digest items first, then
     * resolve the authors from users.
     */
    const {
      data: digestRows,
      error: digestError,
    } = await db
      .from('digest_items')
      .select(
        'text, author_id, sort_order'
      )
      .order('sort_order', {
        ascending: true,
      });

    if (digestError) {
      throw digestError;
    }

    const digestAuthorIds = [
      ...new Set(
        (digestRows || [])
          .map(
            (row) => row.author_id
          )
          .filter(Boolean)
      ),
    ];

    let digestAuthors = {};

    if (digestAuthorIds.length > 0) {
      const {
        data: authors,
        error: authorsError,
      } = await db
        .from('users')
        .select('id, name')
        .in(
          'id',
          digestAuthorIds
        );

      if (authorsError) {
        throw authorsError;
      }

      digestAuthors = Object.fromEntries(
        (authors || []).map(
          (author) => [
            author.id,
            author.name,
          ]
        )
      );
    }

    /*
     * Glossary
     */
    const {
      data: glossary,
      error: glossaryError,
    } = await db
      .from('glossary_terms')
      .select(
        'term, definition, sort_order'
      )
      .order('sort_order', {
        ascending: true,
      });

    if (glossaryError) {
      throw glossaryError;
    }

    /*
     * Learning path items
     */
    const {
      data: learningRows,
      error: learningError,
    } = await db
      .from('learning_path_items')
      .select(
        'path, text, sort_order'
      )
      .order('path', {
        ascending: true,
      })
      .order('sort_order', {
        ascending: true,
      });

    if (learningError) {
      throw learningError;
    }

    /*
     * Roles
     */
    const {
      data: rolesRows,
      error: rolesError,
    } = await db
      .from('roles')
      .select(
        'title, pay_range, note, sort_order'
      )
      .order('sort_order', {
        ascending: true,
      });

    if (rolesError) {
      throw rolesError;
    }

    /*
     * Skill map
     */
    const {
      data: skillMapRows,
      error: skillMapError,
    } = await db
      .from('skill_map_items')
      .select(
        'category, name, sort_order'
      )
      .order('category', {
        ascending: true,
      })
      .order('sort_order', {
        ascending: true,
      });

    if (skillMapError) {
      throw skillMapError;
    }

    /*
     * Build learning paths.
     */
    const learningPaths = {
      starter: [],
      growing: [],
      advanced: [],
    };

    for (const row of learningRows || []) {
      if (
        learningPaths[row.path]
      ) {
        learningPaths[row.path].push(
          row.text
        );
      }
    }

    /*
     * Build skill map.
     */
    const skillMap = {};

    for (
      const row of skillMapRows || []
    ) {
      if (!skillMap[row.category]) {
        skillMap[row.category] = [];
      }

      skillMap[row.category].push(
        row.name
      );
    }

    /*
     * Serialize roles.
     */
    const roles = (
      rolesRows || []
    ).map((row) => ({
      title: row.title,
      payRange: row.pay_range,
      note: row.note,
    }));

    /*
     * Serialize glossary.
     */
    const serializedGlossary = (
      glossary || []
    ).map((row) => ({
      term: row.term,
      definition: row.definition,
    }));

    /*
     * Serialize digest.
     */
    const digest = (
      digestRows || []
    ).map((row) => ({
      text: row.text,
      by:
        digestAuthors[row.author_id] ||
        'the Kollektiv team',
    }));

    /*
     * Return the same response structure
     * as the original SQLite route.
     */
    res.json({
      currentField:
        'product-design-ux',

      fields: FIELD_CATALOG,

      theme: theme
        ? {
            name: theme.name,

            guideText:
              theme.guide_text,

            critiqueText:
              theme.critique_text,

            challengeText:
              theme.challenge_text,

            circleSlug:
              theme.circle_slug,
          }
        : null,

      digest,

      glossary:
        serializedGlossary,

      learningPaths,

      skillMap,

      roles,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;