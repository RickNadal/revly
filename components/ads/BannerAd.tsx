import React from 'react';

interface BannerAdProps {
    title: string;
    description: string;
    imageUrl: string;
}

const BannerAd: React.FC<BannerAdProps> = ({ title, description, imageUrl }) => {
    return (
        <div className="banner-ad">
            <img src={imageUrl} alt={title} />
            <h2>{title}</h2>
            <p>{description}</p>
        </div>
    );
};

export default BannerAd;
