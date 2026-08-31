import React from 'react';

interface AyushLogoProps {
  className?: string;
  size?: number;
}

export const AyushLogo: React.FC<AyushLogoProps> = ({ className = "w-10 h-10", size }) => {
  return (
    <div 
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={size ? { width: size, height: size } : undefined}
    >
      <img
        src="/ayush-logo.jpg"
        alt="National Ayush Mission Logo"
        className="w-full h-full object-contain rounded-full"
        referrerPolicy="no-referrer"
        onError={(e) => {
          // If image fails to load, fallback to crisp inline SVG
          const target = e.currentTarget;
          target.style.display = 'none';
          if (target.nextElementSibling) {
            (target.nextElementSibling as HTMLElement).style.display = 'block';
          }
        }}
      />
      
      {/* Fallback Vector SVG */}
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full hidden"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path id="textArc" d="M 25,100 A 75,75 0 0,1 175,100" fill="none" />
        <text fill="#E8833A" fontSize="15" fontWeight="bold" letterSpacing="1.5">
          <textPath href="#textArc" startOffset="50%" textAnchor="middle">
            NATIONAL AYUSH MISSION
          </textPath>
        </text>

        {/* Bottom Orange Semi-Circle Arc */}
        <path
          d="M 25,110 A 75,75 0 0,0 175,110"
          stroke="#E8833A"
          strokeWidth="16"
          strokeLinecap="round"
          fill="none"
        />

        {/* 5 Green Leaves Fan */}
        <g fill="#2E7D32">
          {/* Leaf 1 (Left) */}
          <path d="M 50,110 C 35,95 40,75 65,85 C 80,95 70,115 50,110 Z" />
          {/* Leaf 2 (Mid Left) */}
          <path d="M 70,85 C 65,55 85,50 90,75 C 92,90 78,98 70,85 Z" />
          {/* Leaf 3 (Top Center) */}
          <path d="M 90,70 C 90,40 110,40 110,70 C 110,85 90,85 90,70 Z" />
          {/* Leaf 4 (Mid Right) */}
          <path d="M 110,75 C 115,50 135,55 130,85 C 122,98 108,90 110,75 Z" />
          {/* Leaf 5 (Right) */}
          <path d="M 135,85 C 160,75 165,95 150,110 C 130,115 120,95 135,85 Z" />
        </g>

        {/* Icons inside leaves (white line drawings) */}
        <g stroke="#FFFFFF" strokeWidth="2.5" fill="none" strokeLinecap="round">
          {/* Pills spilling */}
          <circle cx="50" cy="98" r="3" fill="#FFF" />
          <circle cx="58" cy="94" r="2.5" fill="#FFF" />
          <path d="M 43,90 L 52,98" />
          {/* Kalash / Pot */}
          <path d="M 75,68 Q 80,60 85,68 Q 85,76 75,76 Z" />
          {/* Shirodhara Pot */}
          <path d="M 96,52 Q 100,45 104,52 L 100,60 Z" />
          <circle cx="100" cy="64" r="1.5" fill="#FFF" />
          {/* Mortar & Pestle */}
          <path d="M 116,72 Q 120,78 124,72 Z" />
          <path d="M 122,66 L 118,74" />
          {/* Roots */}
          <path d="M 134,95 C 140,90 148,94 152,90" />
        </g>

        {/* Center Meditating Figure */}
        {/* Head */}
        <path d="M 94,115 C 94,108 106,108 106,115 C 106,120 94,120 94,115 Z" stroke="#8C6D46" strokeWidth="3" fill="none" />
        {/* Torso spine (Green with yellow chakras) */}
        <path d="M 98,122 L 102,122 L 102,150 L 98,150 Z" fill="#2E7D32" />
        <circle cx="100" cy="128" r="2" fill="#FFD700" />
        <circle cx="100" cy="136" r="2" fill="#FFD700" />
        <circle cx="100" cy="144" r="2" fill="#FFD700" />
        {/* Arms and Legs outline */}
        <path
          d="M 85,138 C 75,145 80,158 100,158 C 120,158 125,145 115,138"
          stroke="#8C6D46"
          strokeWidth="3.5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 90,126 Q 80,132 88,142 M 110,126 Q 120,132 112,142"
          stroke="#8C6D46"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
