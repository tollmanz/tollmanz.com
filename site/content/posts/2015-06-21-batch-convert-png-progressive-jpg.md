---
layout:     post
title:      "Batch Converting PNGs to Progressive JPGs"
date:       2015-06-21 11:00:00
categories: images, performance
slug:       batch-convert-png-progressive-jpg
---

I have recently seen a number of [recommendations](http://blog.patrickmeenan.com/2013/06/progressive-jpegs-ftw.html) for using progressive JPGs for improved perceived image loading performance. Additionally, I [recently learned](velocity-2015-good-parts/#tim-kadlec-mobile-image-processing) about [chroma subsampling](http://en.wikipedia.org/wiki/Chroma_subsampling) and decided that I wanted to try deploying images on my site as progressive JPGs with a 4:2:0 chroma subsampling.

Currently, all images on my site are PNGs. I like the level of lossless compression that you can get with PNG, as well as the ability to have an alpha channel. That said, I wanted to experiment with serving different types of images and looked into converting my PNGs to progressive JPGs.

After some searching, I found [Imagemagick's convert](http://www.imagemagick.org/script/convert.php) CLI was a great option for easily converting PNGs to progressive JPGs. I used the following command to handle the batch conversion, which was adapted from [Andrew Walker's Coderwall post](https://coderwall.com/p/ryzmaa/use-imagemagick-to-create-optimised-and-progressive-jpgs):


```bash
for i in /path/to/site/media/images/*.png; do
  convert \
    -strip \
    -interlace plane \
    -background "#F8F8F8" \
    -alpha remove \
    -flatten \
    -quality 80 \
    $i $(echo $i | sed 's/png/jpg/g'); \
done
```

It took a little finagling to get this right. A few important notes:

* The `interlace` argument turns the image into a progressive JPG (or an interlaced PNG if we were making an PNG). The two primary value for this argument seem to be `plane` or `line`. I could not find a definitive answer for what the differences between the two were, so I just used `plane` as Andrew recommended.
* Without specifying a color for the `background` argument, my images with transparency turned to a black background. I gave them a color of `#F8F8F8` to match my site's background color. Additionally, `-alpha remove` was necessary to remove the alpha channel and get the correct background color.
* Convert's default chroma subsampling is 4:2:0, which seems to be the [recommended standard](https://speakerdeck.com/tkadlec/mobile-image-processing-at-velocity-sc-2015); however, in some documentation, it seems like this is only applied if the JPG quality is less than 90.

After deploying these changes, I have seen no measurable performance difference; however, that was not expected. The primary reason for this change is to improve perceived performance, in that the image should theoretically be partially painted to the screen more quickly, giving the perception of faster performance. Interestingly, some of the image sizes were bigger after the conversion, which I suppose makes sense given the compressibility of PNGs.

References:

* [Use ImageMagick to create optimised and progressive JPGs](https://coderwall.com/p/ryzmaa/use-imagemagick-to-create-optimised-and-progressive-jpgs)
* [Convert CLI documentation](http://www.imagemagick.org/script/command-line-options.php)
* [Using `identify` to determine the chroma subsampling of an image](http://www.imagemagick.org/discourse-server/viewtopic.php?t=17145)
* [JPG documentation for Convert](http://www.imagemagick.org/Usage/formats/#jpg_write)
* [Replace transparency in PNG images with white background](http://stackoverflow.com/questions/2322750/replace-transparency-in-png-images-with-white-background)
