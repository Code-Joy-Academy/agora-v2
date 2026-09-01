import type { CurriculumPack } from '../types.js';

// Template pack for Cambridge Lower Secondary Mathematics — Stage 9.
// Expand the nodes as needed while keeping pack_id + node id globally unique.

export const cambridgeStage9Math: CurriculumPack = {
  pack_id: 'cambridge-math-stage-9',

  subject: 'Mathematics',

  stage_label: 'Cambridge Lower Secondary — Stage 9',

  strands: {
    number: 'Number',
    algebra: 'Algebra',
    geometry: 'Geometry & Measure',
    statistics: 'Statistics & Probability',
  },

  nodes: [
    {
      id: 'number-indices-standard-form',
      strand: 'number',
      title: 'Indices and Standard Form',
      description:
        'Using index laws, working with positive and negative integer powers, and expressing numbers in standard form.',

      sample_passage:
        'A scientist records the mass of a particle as 0.00000045 g. Another measurement is 3.2 × 10⁵ times larger.',

      order_index: 1,

      question:
        'How would you write the particle’s mass in standard form, and how would you use powers of ten to find the larger measurement?',

      misconception_triggers: [
        'a negative power makes the number negative',
        'standard form can have a number greater than 10 before the multiplication sign',
        'multiplying powers of ten means adding their bases',
      ],
    },

    {
      id: 'number-ratio-proportion-percentages',
      strand: 'number',
      title: 'Ratio, Proportion and Percentages',
      description:
        'Solving problems involving ratios, direct proportion, percentage change, and reverse percentages.',

      sample_passage:
        'The ratio of boys to girls in a class is 3:5. There are 24 girls in the class.',

      order_index: 2,

      question:
        'How many boys are in the class, and what proportional relationship did you use to find the answer?',

      misconception_triggers: [
        'the ratio 3:5 means there are 3 boys and 5 girls only',
        'ratios should always be converted to percentages first',
        'increasing by 20% and then decreasing by 20% returns to the original value',
      ],
    },

    {
      id: 'algebra-expanding-factorising',
      strand: 'algebra',
      title: 'Expanding and Factorising Algebraic Expressions',
      description:
        'Expanding brackets, collecting like terms, and factorising algebraic expressions using common factors and simple quadratic forms.',

      sample_passage:
        'Consider the expression 3(x + 4) - 2(x - 1).',

      order_index: 3,

      question:
        'How would you expand and simplify this expression, and how can you check that your result is equivalent to the original?',

      misconception_triggers: [
        'the number outside a bracket multiplies only the first term',
        'a negative sign before a bracket does not affect every term',
        'unlike terms such as x and x² can be combined',
      ],
    },

    {
      id: 'algebra-linear-equations',
      strand: 'algebra',
      title: 'Linear Equations and Inequalities',
      description:
        'Solving linear equations and inequalities, including equations involving brackets and variables on both sides.',

      sample_passage:
        'Solve the equation 4x - 7 = 2x + 9.',

      order_index: 4,

      question:
        'What operations would you perform to isolate x, and why must the same operation be applied to both sides?',

      misconception_triggers: [
        'a term can be moved across the equals sign without changing the operation',
        'only one side of an equation needs to be changed',
        'solving an inequality is exactly the same as solving an equation when multiplying by a negative number',
      ],
    },

    {
      id: 'algebra-sequences',
      strand: 'algebra',
      title: 'Sequences and General Terms',
      description:
        'Recognising patterns in sequences, finding term-to-term rules, and deriving expressions for the nth term of arithmetic sequences.',

      sample_passage:
        'The sequence is 5, 9, 13, 17, 21, ...',

      order_index: 5,

      question:
        'What is the nth term of this sequence, and how can you use it to find the 50th term?',

      misconception_triggers: [
        'the nth term is always found by multiplying n by the first term',
        'the common difference is the same as the first term',
        'n represents the value of the term rather than its position',
      ],
    },

    {
      id: 'geometry-pythagoras',
      strand: 'geometry',
      title: 'Pythagoras’ Theorem',
      description:
        'Using Pythagoras’ theorem to calculate unknown sides and solve problems involving right-angled triangles.',

      sample_passage:
        'A right-angled triangle has perpendicular sides of 6 cm and 8 cm.',

      order_index: 6,

      question:
        'How can you determine the length of the hypotenuse, and why is the theorem only directly applicable to right-angled triangles?',

      misconception_triggers: [
        'the longest side is always one of the two shorter sides',
        'Pythagoras applies to every triangle',
        'the formula is a + b = c',
      ],
    },

    {
      id: 'geometry-similarity-scale',
      strand: 'geometry',
      title: 'Similarity and Scale Factors',
      description:
        'Identifying similar shapes and using scale factors to determine corresponding lengths, areas, and volumes.',

      sample_passage:
        'Two triangles are similar. A side measuring 6 cm on the smaller triangle corresponds to a 9 cm side on the larger triangle.',

      order_index: 7,

      question:
        'What is the scale factor from the smaller triangle to the larger triangle, and how would you use it to find another corresponding side?',

      misconception_triggers: [
        'similar shapes must have the same size',
        'the scale factor for area is the same as the scale factor for length',
        'corresponding sides do not need to be in the same ratio',
      ],
    },

    {
      id: 'geometry-circles-area-circumference',
      strand: 'geometry',
      title: 'Circles: Area and Circumference',
      description:
        'Calculating circumference and area of circles and applying these formulas to real-world problems.',

      sample_passage:
        'A circular garden has a radius of 7 metres.',

      order_index: 8,

      question:
        'How would you calculate the circumference and area of the garden, and what is the difference between the two measurements?',

      misconception_triggers: [
        'circumference and area use the same formula',
        'diameter and radius are interchangeable',
        'the area of a circle is 2πr',
      ],
    },

    {
      id: 'statistics-data-representation',
      strand: 'statistics',
      title: 'Representing and Interpreting Data',
      description:
        'Interpreting and constructing statistical diagrams and choosing appropriate representations for different types of data.',

      sample_passage:
        'A survey records the number of hours students spend studying each week.',

      order_index: 9,

      question:
        'Which type of statistical representation would be appropriate for this data, and what features would help you interpret the distribution?',

      misconception_triggers: [
        'every dataset should be displayed as a pie chart',
        'the mean is always the most useful measure',
        'a graph with a larger scale always represents larger values',
      ],
    },

    {
      id: 'statistics-mean-median-range',
      strand: 'statistics',
      title: 'Averages and Spread',
      description:
        'Calculating and interpreting the mean, median, mode, and range and understanding how extreme values affect averages.',

      sample_passage:
        'The test scores are 12, 15, 16, 17, 18, 19, and 45.',

      order_index: 10,

      question:
        'Which measure of average best represents the typical score, and how does the value 45 affect your choice?',

      misconception_triggers: [
        'the mean and median are always equal',
        'the largest value should always be removed before calculating the mean',
        'the range measures the average of the data',
      ],
    },

    {
      id: 'statistics-probability',
      strand: 'statistics',
      title: 'Probability',
      description:
        'Calculating theoretical and experimental probabilities and using probability to analyse events and outcomes.',

      sample_passage:
        'A fair six-sided die is rolled once.',

      order_index: 11,

      question:
        'What is the probability of rolling a number greater than 4, and how would repeated trials affect the experimental probability?',

      misconception_triggers: [
        'every possible outcome has probability 1',
        'experimental probability must exactly equal theoretical probability',
        'a previous roll changes the probability of the next roll of a fair die',
      ],
    },
  ],
};
